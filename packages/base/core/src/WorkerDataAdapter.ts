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

  // The items an active query currently holds, deduplicated by id — the only
  // items this adapter knows about, and the set a selector-based write can be
  // resolved against locally.
  private observableItems(collectionName: string): BaseItem[] {
    const byId = new Map<any, BaseItem>()
    this.queries[collectionName]?.forEach((query) => {
      this.mergePendingWrites(collectionName, query.items).forEach((item) => {
        byId.set(item.id, item)
      })
    })
    return [...byId.values()]
  }

  private mergePendingWrites(collectionName: string, items: BaseItem[]): BaseItem[] {
    const pending = this.pendingWrites.get(collectionName)
    if (!pending || pending.size === 0) return items
    const merged = new Map(items.map(item => [item.id, item] as [any, BaseItem]))
    // Ascending seq order — a later write to the same item must win.
    ;[...pending.entries()]
      .toSorted(([a], [b]) => a - b)
      .forEach(([, write]) => {
        write.upserts.forEach((item, id) => merged.set(id, item))
        write.deletes.forEach(id => merged.delete(id))
      })
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
      const wasHolding = query.items.some(item => affectedIds.has(item.id))
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
    const matches = this.observableItems(collectionName).filter(item => match(item, selector))
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
        const pending = this.pendingWrites.get(collection.name)
        if (!pending || pending.size === 0) return query.items as T[]
        return applyQueryOptions(
          this.mergePendingWrites(collection.name, query.items),
          selector,
          options,
        ) as T[]
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
