import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions, StateChangeCallback } from './DataAdapter'
import type Modifier from './types/Modifier'
import type Selector from './types/Selector'
import queryId from './utils/queryId'
import randomId from './utils/randomId'
import batchOnNextTick from './utils/batchOnNextTick'
import applyQueryOptions from './utils/applyQueryOptions'
import match from './utils/match'
import modify from './utils/modify'
import deepClone from './utils/deepClone'

interface WorkerDataAdapterOptions {
  id?: string,
  log?: (message: string, ...args: any[]) => void,
}

export interface WorkerDataAdapterEndpoint {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void,
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void,
  postMessage: (message: unknown) => void,
  terminate?: () => void,
}

// The ids a selector names outright, or `null` when it asks something the ids alone cannot answer.
// Deliberately strict: one key, `id`, holding a primitive or a lone `$in`. Anything else — another
// field alongside it, an operator, a nested condition — falls back to matching, because guessing
// wrong here would silently drop a row from a write.
/**
 * Extracts the ids a selector names outright.
 * @param selector - The selector to inspect.
 * @returns The named ids, or `null` when the selector asks more than ids can answer.
 */
function selectorIds(selector: Selector<any>): any[] | null {
  if (selector == null || typeof selector !== 'object') return null
  const keys = Object.keys(selector as Record<string, unknown>)
  if (keys.length !== 1 || keys[0] !== 'id') return null
  const value = (selector as Record<string, unknown>).id
  if (value == null) return null
  if (typeof value !== 'object') return [value]
  const valueKeys = Object.keys(value as Record<string, unknown>)
  if (valueKeys.length !== 1 || valueKeys[0] !== '$in') return null
  const inValues = (value as { $in: unknown }).$in
  return Array.isArray(inValues) ? inValues : null
}

export default class WorkerDataAdapter implements DataAdapter {
  private id: string
  private isDisposed = false
  private workerReady: Promise<void>
  private log: (message: string, ...args: any[]) => void = () => {}
  private collectionReady: Map<string, Promise<void>> = new Map()
  private batchExecutionHelpers: Map<string, ReturnType<typeof batchOnNextTick<string>>> = new Map()
  private queries: Record<string, Map<string, {
    selector: Selector<any>,
    options?: QueryOptions<any>,
    state: 'active' | 'complete' | 'error',
    error: Error | null,
    items: BaseItem[],
    // Lazily built from `items`, dropped whenever they are replaced. Every question this adapter
    // asks about a pending write — does this query hold that id, what is the current item for it —
    // is a lookup by id, and answering those by scanning `items` made each write cost the size of
    // every active query's result.
    itemsById?: Map<any, BaseItem>,
    stateChangeCallbacks: StateChangeCallback[],
    eventHandler?: (event: MessageEvent) => void,
  }>> = {}

  // Writes that have been issued but not yet confirmed by the worker. Their
  // effect is layered on top of each active query's last authoritative result
  // in `getQueryResult`, so a cursor reflects a write immediately instead of
  // waiting out the postMessage → SQLite write → re-executed query →
  // postMessage round trip. Deliberately scoped to items that active queries
  // already hold: this adapter must not turn into a full in-memory mirror of
  // the backing store, and anything no active query holds isn't observable
  // anyway. Dropped again once the write settles — on success the worker's
  // own `queryUpdate` has already landed (it is posted before the write's
  // response, and message order is preserved), on failure dropping it is the
  // rollback.
  private pendingWrites: Map<string, Map<number, {
    upserts: Map<any, BaseItem>,
    deletes: Set<any>,
  }>> = new Map()

  private pendingWriteSeq = 0

  constructor(private worker: WorkerDataAdapterEndpoint, private options: WorkerDataAdapterOptions) {
    this.id = this.options.id || 'default-worker-data-adapter'
    if (this.options.log) this.log = this.options.log
    this.workerReady = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('WorkerDataAdapter initialization timed out'))
      }, 5000)
      const handleMessage = (event: MessageEvent) => {
        const { type, workerId } = event.data as { type: 'ready', workerId: string }
        if (workerId !== this.id) return
        if (type === 'ready') {
          resolve()
          clearTimeout(timeoutId)
          this.worker.removeEventListener('message', handleMessage)
        }
      }
      this.worker.addEventListener('message', handleMessage)
    })
  }

  private async exec<T>(method: string, collectionName: string, ...args: any[]): Promise<T> {
    await this.workerReady
    if (method !== 'isReady') {
      const collectionReady = this.collectionReady.get(collectionName)
      if (!collectionReady) throw new Error(`Collection "${collectionName}" is not registered in WorkerDataAdapter`)
      await collectionReady
    }
    if (this.isDisposed) {
      throw new Error('WorkerDataAdapter is disposed')
    }
    return new Promise((resolve, reject) => {
      const messageId = randomId()
      const handleMessage = (event: MessageEvent) => {
        const { id, workerId, type, data, error } = event.data as {
          id: string,
          workerId: string,
          type: 'response' | 'queryUpdate',
          data?: T,
          error?: Error,
        }
        if (workerId !== this.id) return
        if (type !== 'response') return
        if (id !== messageId) return

        this.log(method, 'result', data ?? error)
        if (error) {
          reject(error)
        } else {
          resolve(data as T)
        }
        this.worker.removeEventListener('message', handleMessage)
      }
      this.worker.addEventListener('message', handleMessage)
      this.worker.postMessage({
        id: messageId,
        workerId: this.id,
        method,
        args: [collectionName, ...args],
      })
    })
  }

  private queryItemsById(
    query: { items: BaseItem[], itemsById?: Map<any, BaseItem> },
  ): Map<any, BaseItem> {
    if (!query.itemsById) {
      query.itemsById = new Map(query.items.map(item => [item.id, item] as [any, BaseItem]))
    }
    return query.itemsById
  }

  // The pending writes of a collection collapsed into one upsert/delete view, newest write winning.
  // `null` when there are none, which is the overwhelmingly common case and the one every caller
  // below short-circuits on. Pending sets are tiny — a write or two in flight — so this is cheap in
  // a way that touching each query's items is not.
  private flattenPendingWrites(
    collectionName: string,
  ): { upserts: Map<any, BaseItem>, deletes: Set<any> } | null {
    const pending = this.pendingWrites.get(collectionName)
    if (!pending || pending.size === 0) return null
    const upserts = new Map<any, BaseItem>()
    const deletes = new Set<any>()
    // Ascending seq order — a later write to the same item must win. `sort` rather than
    // `toSorted`: the array is already a fresh copy, so sorting it in place mutates nothing the
    // caller holds, and React Native's Hermes engine has no `Array.prototype.toSorted`.
    ;[...pending.entries()]
      .sort(([a], [b]) => a - b) // eslint-disable-line unicorn/no-array-sort -- unavailable on Hermes
      .forEach(([, write]) => {
        write.upserts.forEach((item, id) => {
          upserts.set(id, item)
          deletes.delete(id)
        })
        write.deletes.forEach((id) => {
          deletes.add(id)
          upserts.delete(id)
        })
      })
    return { upserts, deletes }
  }

  // The items an active query currently holds, deduplicated by id, plus whatever the pending writes
  // add or remove — the only items this adapter knows about, and the set a selector-based write is
  // resolved against locally. One pass over the queries rather than a merge per query.
  private observableItems(collectionName: string): BaseItem[] {
    const byId = new Map<any, BaseItem>()
    this.queries[collectionName]?.forEach((query) => {
      query.items.forEach(item => byId.set(item.id, item))
    })
    const pending = this.flattenPendingWrites(collectionName)
    if (pending) {
      pending.upserts.forEach((item, id) => byId.set(id, item))
      pending.deletes.forEach(id => byId.delete(id))
    }
    return [...byId.values()]
  }

  // The same answer as `observableItems` restricted to known ids — for the selector shapes that
  // name them (`{ id }`, `{ id: { $in } }`), which is what an ordinary `updateOne`/`removeOne`
  // carries. Costs a handful of map lookups instead of materialising every active query's result
  // and running the matcher over all of it.
  private observableItemsByIds(collectionName: string, ids: readonly any[]): BaseItem[] {
    const pending = this.flattenPendingWrites(collectionName)
    const found = new Map<any, BaseItem>()
    ids.forEach((id) => {
      if (pending?.deletes.has(id)) return
      const pendingItem = pending?.upserts.get(id)
      if (pendingItem) {
        found.set(id, pendingItem)
        return
      }
      const queries = this.queries[collectionName]
      if (!queries) return
      for (const query of queries.values()) {
        const item = this.queryItemsById(query).get(id)
        if (item) {
          found.set(id, item)
          return
        }
      }
    })
    return [...found.values()]
  }

  // Whether any pending write changes what this query would return. Answered against the pending
  // set (small) and the query's id index, never by walking its items: a query no in-flight write
  // touches — nearly all of them, nearly always — keeps its own array, so its readers skip both the
  // merge and the re-filtering that would follow it.
  private mergePendingWrites(
    collectionName: string,
    query: { selector: Selector<any>, items: BaseItem[], itemsById?: Map<any, BaseItem> },
  ): BaseItem[] {
    const pending = this.flattenPendingWrites(collectionName)
    if (!pending) return query.items
    const byId = this.queryItemsById(query)
    let affected = false
    pending.deletes.forEach((id) => {
      if (byId.has(id)) affected = true
    })
    if (!affected) {
      pending.upserts.forEach((item, id) => {
        if (affected) return
        if (byId.has(id)) affected = true
        else if (query.selector != null && match(item, query.selector)) affected = true
      })
    }
    if (!affected) return query.items

    const merged = new Map(byId)
    pending.upserts.forEach((item, id) => merged.set(id, item))
    pending.deletes.forEach(id => merged.delete(id))
    return [...merged.values()]
  }

  /**
   * Registers a write's effect locally and notifies every active query it
   * touches, then returns a function that drops it again once the write
   * settles.
   * @param collectionName - The collection the write targets.
   * @param upserts - Items inserted or updated by the write.
   * @param deletes - Ids removed by the write.
   * @returns A function that drops the pending write and re-notifies.
   */
  private applyPendingWrite(
    collectionName: string,
    upserts: BaseItem[],
    deletes: any[],
  ): () => void {
    if (upserts.length === 0 && deletes.length === 0) return () => {}
    const seq = this.pendingWriteSeq += 1
    const pending = this.pendingWrites.get(collectionName)
      ?? new Map<number, { upserts: Map<any, BaseItem>, deletes: Set<any> }>()
    pending.set(seq, {
      upserts: new Map(upserts.map(item => [item.id, item] as [any, BaseItem])),
      deletes: new Set(deletes),
    })
    this.pendingWrites.set(collectionName, pending)

    const affectedIds = new Set([...upserts.map(item => item.id), ...deletes])
    this.notifyAffectedQueries(collectionName, upserts, affectedIds)

    return () => {
      const current = this.pendingWrites.get(collectionName)
      if (!current) return
      current.delete(seq)
      if (current.size === 0) this.pendingWrites.delete(collectionName)
      this.notifyAffectedQueries(collectionName, upserts, affectedIds)
    }
  }

  // Re-runs the state-change callbacks of every query whose result the write
  // can have changed — either because a written item matches its selector, or
  // because it already held one of the affected items (an update that moves an
  // item out of a query, or a removal).
  private notifyAffectedQueries(
    collectionName: string,
    upserts: BaseItem[],
    affectedIds: Set<any>,
  ) {
    this.queries[collectionName]?.forEach((query) => {
      const byId = this.queryItemsById(query)
      let wasHolding = false
      affectedIds.forEach((id) => {
        if (byId.has(id)) wasHolding = true
      })
      const nowMatches = upserts.some(item => query.selector != null
        && match(item, query.selector))
      if (!wasHolding && !nowMatches) return
      query.stateChangeCallbacks.forEach(callback => callback(query.state))
    })
  }

  private matchObservableItems(
    collectionName: string,
    selector: Selector<any>,
    onlyFirst: boolean,
  ): BaseItem[] {
    if (selector == null) return []
    // `updateOne({ id })` and `removeOne({ id })` are what an application writes most of the time,
    // and they name exactly the rows they touch — no reason to materialise every active query's
    // result and run the matcher over all of it to find them.
    const ids = selectorIds(selector)
    const matches = ids == null
      ? this.observableItems(collectionName).filter(item => match(item, selector))
      : this.observableItemsByIds(collectionName, ids)
    return onlyFirst ? matches.slice(0, 1) : matches
  }

  private resolveUpdate(
    collectionName: string,
    selector: Selector<any>,
    modifier: Modifier<any>,
    onlyFirst: boolean,
  ): { upserts: BaseItem[], deletes: any[] } {
    const { $setOnInsert, ...restModifier } = modifier
    const upserts: BaseItem[] = []
    const deletes: any[] = []
    this.matchObservableItems(collectionName, selector, onlyFirst).forEach((item) => {
      const modifiedItem = modify(deepClone(item), restModifier)
      upserts.push(modifiedItem)
      if (modifiedItem.id !== item.id) deletes.push(item.id)
    })
    return { upserts, deletes }
  }

  private resolveRemoval(
    collectionName: string,
    selector: Selector<any>,
    onlyFirst: boolean,
  ): any[] {
    return this.matchObservableItems(collectionName, selector, onlyFirst).map(item => item.id)
  }

  private resolveReplacement(
    item: BaseItem,
    replacement: Record<string, any>,
  ): { upserts: BaseItem[], deletes: any[] } {
    const modifiedItem = { ...replacement, id: replacement.id ?? item.id } as BaseItem
    return {
      upserts: [modifiedItem],
      deletes: modifiedItem.id === item.id ? [] : [item.id],
    }
  }

  // Makes a write's effect visible to active queries for the duration of the
  // round trip, and drops it again once the worker has spoken — see
  // `pendingWrites`.
  private async withPendingWrite<T>(
    collectionName: string,
    delta: { upserts: BaseItem[], deletes: any[] },
    run: () => Promise<T>,
  ): Promise<T> {
    const dropPendingWrite = this.applyPendingWrite(
      collectionName,
      delta.upserts,
      delta.deletes,
    )
    try {
      return await run()
    } finally {
      dropPendingWrite()
    }
  }

  private enqueueBatched<T>(collectionName: string, method: string, args: any[]): Promise<T> {
    const helper = this.batchExecutionHelpers.get(collectionName)
    if (!helper) throw new Error(`Collection "${collectionName}" is not registered in WorkerDataAdapter`)
    return helper.enqueue(method, args)
  }
  // ---------- end batching integration ----------

  private updateQuery(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
    update: {
      state?: 'active' | 'complete' | 'error',
      error?: Error | null,
      items?: BaseItem[],
      stateChangeCallbacks?: StateChangeCallback[],
      eventHandler?: (event: MessageEvent) => void,
    },
  ) {
    const id = queryId(query.selector, query.options)
    const collectionQueries = this.queries[collectionName]
    if (!collectionQueries) return
    const existing = collectionQueries.get(id)
    const newState = {
      selector: query.selector,
      options: query.options,
      state: 'active' as const,
      error: null,
      items: [],
      stateChangeCallbacks: [],
      eventHandler: existing?.eventHandler,
      ...existing,
      ...update,
      // The index describes `items`; a new result set invalidates it.
      ...update.items ? { itemsById: undefined } : {},
    }
    collectionQueries.set(id, newState)
    this.queries[collectionName] = collectionQueries
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    indices: string[],
  ): CollectionBackend<T, I> {
    this.queries[collection.name] = new Map()
    void this.exec('registerCollection', collection.name, indices)
    this.collectionReady.set(collection.name, this.exec('isReady', collection.name))
    this.batchExecutionHelpers.set(
      collection.name,
      batchOnNextTick<string>(async (method, args) => this.exec(method, collection.name, args)),
    )
    return {
      insert: async (item) => {
        return this.withPendingWrite(
          collection.name,
          { upserts: [item], deletes: [] },
          () => this.enqueueBatched<T>(collection.name, 'insert', [item]),
        )
      },
      updateOne: async (selector, modifier) => {
        return this.withPendingWrite(
          collection.name,
          this.resolveUpdate(collection.name, selector, modifier, true),
          () => this.enqueueBatched<T[]>(collection.name, 'updateOne', [selector, modifier]),
        )
      },
      updateMany: async (selector, modifier) => {
        return this.withPendingWrite(
          collection.name,
          this.resolveUpdate(collection.name, selector, modifier, false),
          () => this.enqueueBatched<T[]>(collection.name, 'updateMany', [selector, modifier]),
        )
      },
      replaceOne: async (selector, replacement) => {
        const [item] = this.matchObservableItems(collection.name, selector, true)
        return this.withPendingWrite(
          collection.name,
          item == null
            ? { upserts: [], deletes: [] }
            : this.resolveReplacement(item, replacement),
          () => this.enqueueBatched<T[]>(collection.name, 'replaceOne', [selector, replacement]),
        )
      },
      removeOne: async (selector) => {
        return this.withPendingWrite(
          collection.name,
          { upserts: [], deletes: this.resolveRemoval(collection.name, selector, true) },
          () => this.enqueueBatched<T[]>(collection.name, 'removeOne', [selector]),
        )
      },
      removeMany: async (selector) => {
        return this.withPendingWrite(
          collection.name,
          { upserts: [], deletes: this.resolveRemoval(collection.name, selector, false) },
          () => this.enqueueBatched<T[]>(collection.name, 'removeMany', [selector]),
        )
      },

      // methods for registering and unregistering queries that will be called from the collection during find/findOne
      registerQuery: (selector, options) => {
        this.updateQuery(collection.name, { selector, options }, { state: 'active', error: null, items: [] })
        void this.exec('registerQuery', collection.name, selector, options)

        const handler = (event: MessageEvent) => {
          const { type, data, workerId, error } = event.data
          if (type !== 'queryUpdate') return
          if (data == null) return
          const {
            collectionName,
            selector: responseSelector,
            options: responseOptions,
            state,
            items,
          } = data as {
            collectionName: string,
            selector: Selector<T>,
            options?: QueryOptions<T>,
            state: 'active' | 'complete' | 'error',
            items: T[],
          }
          if (workerId !== this.id) return
          if (collectionName !== collection.name) return
          if (queryId(responseSelector, responseOptions) !== queryId(selector, options)) return
          this.log('queryUpdate', responseSelector, responseOptions, state, data ?? error)
          this.updateQuery(collection.name, {
            selector: responseSelector,
            options: responseOptions,
          }, { state, error, items })

          const query = this.queries[collection.name]?.get(queryId(selector, options))
          if (!query) return
          query.stateChangeCallbacks.forEach(callback => callback(state))
        }
        this.worker.addEventListener('message', handler)
        this.updateQuery(collection.name, { selector, options }, { eventHandler: handler })
      },
      unregisterQuery: (selector, options) => {
        const qid = queryId(selector, options)
        const query = this.queries[collection.name]?.get(qid)
        if (query?.eventHandler) {
          this.worker.removeEventListener('message', query.eventHandler)
        }
        this.queries[collection.name]?.delete(qid)
        void this.exec('unregisterQuery', collection.name, selector, options)
      },
      getQueryState: (selector, options) => {
        const query = this.queries[collection.name]?.get(queryId(selector, options))
        return query?.state || 'active'
      },
      getQueryError: (selector, options) => {
        const query = this.queries[collection.name]?.get(queryId(selector, options))
        return query?.error || null
      },
      getQueryResult: (selector, options) => {
        const query = this.queries[collection.name]?.get(queryId(selector, options))
        if (!query) return []
        const merged = this.mergePendingWrites(collection.name, query)
        // Same array means no in-flight write changes this query, so the backend's own result still
        // stands — re-filtering and re-sorting it would only reproduce it at the cost of doing so
        // on every read for as long as any write is in flight.
        if (merged === query.items) return query.items as T[]
        return applyQueryOptions(merged, selector, options) as T[]
      },
      onQueryStateChange: (selector, options, callback) => {
        this.updateQuery(collection.name, { selector, options }, {
          stateChangeCallbacks: [
            ...this.queries[collection.name]?.get(
              queryId(selector, options),
            )?.stateChangeCallbacks || [],
            callback,
          ],
        })

        return () => {
          const currentCallbacks = this.queries[collection.name]?.get(
            queryId(selector, options),
          )?.stateChangeCallbacks
          if (!currentCallbacks) return
          this.updateQuery(collection.name, { selector, options }, {
            stateChangeCallbacks: currentCallbacks
              .filter(existingCallback => existingCallback !== callback),
          })
        }
      },
      executeQuery: (selector, options) => this.exec('executeQuery', collection.name, selector, options),

      // lifecycle methods
      dispose: async () => {
        await this.exec('unregisterCollection', collection.name)
        this.isDisposed = true
        this.worker.terminate?.()
      },
      isReady: async () => {
        await this.exec('isReady', collection.name)
      },
    }
  }
}
