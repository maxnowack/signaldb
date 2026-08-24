import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions, StateChangeCallback } from './DataAdapter'
import type Modifier from './types/Modifier'
import type Selector from './types/Selector'
import queryId from './utils/queryId'
import randomId from './utils/randomId'
import batchOnNextTick from './utils/batchOnNextTick'
import { mergeChangesetIntoResult } from './utils/incrementalQueryUpdate'
import {
  applyQueryDelta,
  callWithDelta,
  canApplyQueryDelta,
  diffQueryResults,
  isEmptyQueryDelta,
} from './utils/queryDelta'
import type { QueryDelta } from './utils/queryDelta'
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

interface QueryRecord {
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
  stateChangeCallbacks: StateChangeCallback<any>[],
  // The last answer `servedResult` gave, together with the two things that can invalidate it: the
  // stored result it was derived from, and the state of the collection's pending writes. A query is
  // read far more often than it is written to — every cursor read goes through here, and the
  // adapter asks several times per write — and layering the pending writes on costs the size of
  // those writes each time. Keeping the answer also gives readers a stable array to compare.
  served?: { items: BaseItem[], fromItems: BaseItem[], pendingVersion: number },
}

export default class WorkerDataAdapter implements DataAdapter {
  private id: string
  private isDisposed = false
  private workerReady: Promise<void>
  private log: (message: string, ...args: any[]) => void = () => {}
  private collectionReady: Map<string, Promise<void>> = new Map()
  private batchExecutionHelpers: Map<string, ReturnType<typeof batchOnNextTick<string>>> = new Map()
  private queries: Record<string, Map<string, QueryRecord>> = {}

  // Resolvers for `exec` calls that are still waiting for their response, keyed by message id.
  // Together with the query registry above this is everything the shared dispatcher needs to route
  // a message, which is why there is no longer a listener per request or per query.
  private pendingRequests: Map<string, {
    resolve: (value: any) => void,
    reject: (error: Error) => void,
  }> = new Map()

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

  // Bumped whenever a collection's pending writes change, in either direction. Anything derived
  // from them is stale from that moment on.
  private pendingWriteVersions: Map<string, number> = new Map()

  private bumpPendingWriteVersion(collectionName: string) {
    const current = this.pendingWriteVersions.get(collectionName) ?? 0
    this.pendingWriteVersions.set(collectionName, current + 1)
  }

  constructor(
    private worker: WorkerDataAdapterEndpoint,
    private options: WorkerDataAdapterOptions,
  ) {
    this.id = this.options.id || 'default-worker-data-adapter'
    if (this.options.log) this.log = this.options.log
    this.workerReady = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('WorkerDataAdapter initialization timed out'))
      }, 5000)
      this.resolveWorkerReady = () => {
        clearTimeout(timeoutId)
        resolve()
      }
    })
    this.worker.addEventListener('message', this.handleWorkerMessage)
  }

  private resolveWorkerReady: () => void = () => {}

  // The one and only message listener this adapter installs. Every response and every query update
  // is routed from here by a map lookup. Listening per request and per query instead meant each
  // incoming message was offered to every listener in turn, and each of them re-serialized its own
  // selector to decide the message was not for it — turning a write that touches N queries into
  // N² selector serializations before any of the actual work started.
  private handleWorkerMessage = (event: MessageEvent) => {
    const message = event.data as {
      id?: string,
      workerId?: string,
      type?: 'ready' | 'response' | 'queryUpdate',
      data?: any,
      error?: Error,
    } | null
    if (message == null) return
    if (message.workerId !== this.id) return

    if (message.type === 'ready') {
      this.resolveWorkerReady()
      return
    }

    if (message.type === 'response') {
      if (message.id == null) return
      const pending = this.pendingRequests.get(message.id)
      if (!pending) return
      this.pendingRequests.delete(message.id)
      this.log('response', message.data ?? message.error)
      if (message.error) {
        pending.reject(message.error)
      } else {
        pending.resolve(message.data)
      }
      return
    }

    if (message.type === 'queryUpdate') this.handleQueryUpdate(message.data, message.error ?? null)
  }

  private handleQueryUpdate(data: any, error: Error | null) {
    if (data == null) return
    const {
      collectionName,
      qid,
      selector,
      options,
      state,
      items,
      delta,
    } = data as {
      collectionName?: string,
      qid?: string,
      selector?: Selector<any>,
      options?: QueryOptions<any>,
      state: 'active' | 'complete' | 'error',
      items?: BaseItem[],
      delta?: QueryDelta<any>,
    }
    if (collectionName == null) return
    const collectionQueries = this.queries[collectionName]
    if (!collectionQueries) return

    // The host names the query outright; deriving the id from the selector is only for messages
    // that predate that (and for tests that hand-roll one).
    const id = qid ?? (selector === undefined ? undefined : queryId(selector, options))
    if (id == null) return
    const query = collectionQueries.get(id)
    if (!query) return

    this.log('queryUpdate', query.selector, query.options, state, data ?? error)

    let nextItems = items
    let deltaToPublish: QueryDelta<any> | undefined
    if (delta != null) {
      // A delta only makes sense against the result it was computed from. If this adapter is
      // holding something else — a message lost, a query re-registered underneath, a host and an
      // adapter that disagree — applying it anyway would leave a result that silently drifts from
      // the store. Refusing it keeps the last coherent result instead, and the next full answer
      // puts things right. A delta describing no change at all is refused for the simpler reason
      // that there is nothing to apply.
      //
      // The *state* the message carries is not part of that judgement, and used to be dropped
      // along with the delta. A host that cannot answer a query from its previous result announces
      // `'active'`, re-executes, and answers with a delta — which is empty whenever the write left
      // this query's result as it was. The query then stayed `'active'` here for good, because no
      // further message was coming to correct it: `Cursor#isLoading()` reported a first result
      // still pending forever, and every screen gated on it showed its loading state forever.
      const canApply = canApplyQueryDelta(query.items, delta)
      if (!canApply || isEmptyQueryDelta(delta)) {
        if (state === query.state) return
        this.updateQuery(collectionName, {
          selector: query.selector,
          options: query.options,
        }, { state, error })
        const settled = collectionQueries.get(id)
        if (!settled) return
        // An empty delta is passed on as it came: it settles the query without asking anyone to
        // recompute a result that did not change. One that could not be applied is not, so the
        // consumer re-reads and the disagreement ends there.
        settled.stateChangeCallbacks
          .forEach(callback => callWithDelta(callback, state, canApply ? delta : undefined))
        return
      }

      const pendingBefore = this.flattenPendingWrites(collectionName)
      const servedBefore = pendingBefore == null
        ? null
        : this.servedResult(collectionName, query)
      nextItems = applyQueryDelta(query.items, delta)

      if (servedBefore == null) {
        // Nothing is layered on top of the stored result, so what the host described is exactly
        // what a reader of this query will see change.
        deltaToPublish = delta
      } else {
        // A write is still in flight, and its effect has been shown to readers all along. What
        // they see change is the difference between the two layered results — which, for the
        // ordinary case of the host confirming the write that is in flight, is nothing at all.
        this.updateQuery(collectionName, {
          selector: query.selector,
          options: query.options,
        }, { state, error, items: nextItems })
        const stored = collectionQueries.get(id)
        if (!stored) return
        const servedDelta = diffQueryResults(
          servedBefore,
          this.servedResult(collectionName, stored),
        )
        if (isEmptyQueryDelta(servedDelta) && state === query.state) return
        stored.stateChangeCallbacks
          .forEach(callback => callWithDelta(callback, state, servedDelta))
        return
      }
    }

    this.updateQuery(collectionName, {
      selector: query.selector,
      options: query.options,
    }, { state, error, items: nextItems })

    const updated = collectionQueries.get(id)
    if (!updated) return
    updated.stateChangeCallbacks.forEach(callback => callWithDelta(callback, state, deltaToPublish))
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
      this.pendingRequests.set(messageId, { resolve, reject })
      this.worker.postMessage({
        id: messageId,
        workerId: this.id,
        method,
        args: [collectionName, ...args],
      })
    })
  }

  /**
   * Issues a call whose result nobody is waiting for, and makes sure a failure has somewhere to
   * go. A bare rejection here would surface as an uncaught error — which is what a disposed
   * collection produced every time a cursor was cleaned up after it.
   * @param method - The method to call on the worker.
   * @param collectionName - The collection it applies to.
   * @param args - The remaining arguments.
   * @param onError - Called when the call fails, in place of merely logging it.
   */
  private execInBackground(
    method: string,
    collectionName: string,
    args: unknown[] = [],
    onError?: (error: Error) => void,
  ) {
    this.exec(method, collectionName, ...args).catch((error: Error) => {
      if (onError) {
        onError(error)
        return
      }
      this.log(method, 'failed', error)
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
  // Whether a query's result is the items themselves rather than a projection of them. A write is
  // resolved locally by applying its modifier to the item this adapter holds, and applying it to an
  // item that has had fields removed produces something that is not the item — one that a selector
  // naming a projected-away field no longer matches, so the row would vanish from every other
  // query until the store answered. An item known only through a projection is therefore treated as
  // not known at all: the write still happens, it simply is not shown before the store confirms it.
  private static providesFullItems(query: { options?: QueryOptions<any> }) {
    return query.options?.fields == null
  }

  private observableItems(collectionName: string): BaseItem[] {
    const byId = new Map<any, BaseItem>()
    this.queries[collectionName]?.forEach((query) => {
      if (!WorkerDataAdapter.providesFullItems(query)) return
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
        if (!WorkerDataAdapter.providesFullItems(query)) continue
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
  // What `getQueryResult` answers: the query's last confirmed result with whatever writes are still
  // in flight folded into it. Only the items those writes touch are examined — the rest matched
  // when the store produced them and are carried over untouched, which is both what makes this cost
  // the size of the pending writes rather than the size of the result, and what keeps a projected
  // result from being re-matched against fields its projection has already dropped.
  private servedResult(collectionName: string, query: QueryRecord): BaseItem[] {
    const pendingVersion = this.pendingWriteVersions.get(collectionName) ?? 0
    if (query.served
      && query.served.fromItems === query.items
      && query.served.pendingVersion === pendingVersion) {
      return query.served.items
    }

    const items = this.computeServedResult(collectionName, query)
    query.served = { items, fromItems: query.items, pendingVersion }
    return items
  }

  private computeServedResult(collectionName: string, query: QueryRecord): BaseItem[] {
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

    return mergeChangesetIntoResult(query.items, query.selector, query.options, {
      upserts: [...pending.upserts.values()],
      deletes: [...pending.deletes],
    })
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
    const affectedIds = new Set([...upserts.map(item => item.id), ...deletes])
    const affected = this.affectedQueries(collectionName, upserts, affectedIds)
    // Captured before the write is registered, so the notification below can say what actually
    // changed for a reader rather than just that something did.
    const servedBefore = this.servedResults(collectionName, affected)

    const seq = this.pendingWriteSeq += 1
    const pending = this.pendingWrites.get(collectionName)
      ?? new Map<number, { upserts: Map<any, BaseItem>, deletes: Set<any> }>()
    pending.set(seq, {
      upserts: new Map(upserts.map(item => [item.id, item] as [any, BaseItem])),
      deletes: new Set(deletes),
    })
    this.pendingWrites.set(collectionName, pending)
    this.bumpPendingWriteVersion(collectionName)
    this.notifyWithDeltas(collectionName, affected, servedBefore)

    return () => {
      const current = this.pendingWrites.get(collectionName)
      if (!current) return
      const affectedOnDrop = this.affectedQueries(collectionName, upserts, affectedIds)
      const beforeDrop = this.servedResults(collectionName, affectedOnDrop)
      current.delete(seq)
      if (current.size === 0) this.pendingWrites.delete(collectionName)
      this.bumpPendingWriteVersion(collectionName)
      // By the time a write settles the host's own answer has usually already landed, so dropping
      // the optimistic copy changes nothing a reader can see and produces no notification at all.
      this.notifyWithDeltas(collectionName, affectedOnDrop, beforeDrop)
    }
  }

  // The queries whose result the write can have changed — either because a written item matches
  // their selector, or because they already hold one of the affected items (an update that moves
  // an item out of a query, or a removal).
  private affectedQueries(
    collectionName: string,
    upserts: BaseItem[],
    affectedIds: Set<any>,
  ) {
    const affected: QueryRecord[] = []
    this.queries[collectionName]?.forEach((query) => {
      const byId = this.queryItemsById(query)
      let wasHolding = false
      affectedIds.forEach((id) => {
        if (byId.has(id)) wasHolding = true
      })
      const nowMatches = upserts.some(item => query.selector != null
        && match(item, query.selector))
      if (!wasHolding && !nowMatches) return
      affected.push(query)
    })
    return affected
  }

  private servedResults(collectionName: string, queries: QueryRecord[]) {
    return new Map(queries.map(query => [query, this.servedResult(collectionName, query)]))
  }

  // Tells each query what changed for someone reading it, and says nothing to a query where the
  // answer is the same as before. A reader that has to re-run the query to find that out pays for
  // the whole result to learn nothing.
  private notifyWithDeltas(
    collectionName: string,
    queries: QueryRecord[],
    servedBefore: Map<QueryRecord, BaseItem[]>,
  ) {
    queries.forEach((query) => {
      const before = servedBefore.get(query)
      if (before == null) return
      const delta = diffQueryResults(before, this.servedResult(collectionName, query))
      if (isEmptyQueryDelta(delta)) return
      query.stateChangeCallbacks.forEach(callback => callWithDelta(callback, query.state, delta))
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
      stateChangeCallbacks?: StateChangeCallback<any>[],
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
      stateChangeCallbacks: [],
      ...existing,
      ...update,
      // An update that says nothing about the items leaves them alone. A query going back to
      // `'active'` while it is recomputed is exactly that, and letting it blank the result would
      // leave every reader of this query with nothing to show until the recomputation lands.
      ...update.items
        ? { items: update.items, itemsById: undefined }
        : { items: existing?.items ?? [] },
    }
    collectionQueries.set(id, newState)
    this.queries[collectionName] = collectionQueries
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    indices: string[],
  ): CollectionBackend<T, I> {
    this.queries[collection.name] = new Map()
    this.execInBackground('registerCollection', collection.name, [indices])
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
        // A query the worker could not register will never answer. Left as a bare rejection it
        // would surface as an uncaught error and the cursor would sit on its empty result forever,
        // indistinguishable from a query with nothing to show; published as an error it reaches
        // the collection's `query.error` event, which is what that event is for.
        this.execInBackground(
          'registerQuery',
          collection.name,
          [selector, options],
          (error) => {
            const query = this.queries[collection.name]?.get(queryId(selector, options))
            if (!query) return
            this.updateQuery(collection.name, { selector, options }, { state: 'error', error })
            query.stateChangeCallbacks.forEach(callback => callback('error'))
          },
        )
      },
      unregisterQuery: (selector, options) => {
        this.queries[collection.name]?.delete(queryId(selector, options))
        // Nothing holds the query any more, so a failure here has nobody to report to — but it
        // still must not escape as an uncaught error, which is what a disposed collection would
        // otherwise produce every time a cursor was cleaned up after it.
        this.execInBackground('unregisterQuery', collection.name, [selector, options])
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
        return this.servedResult(collection.name, query) as T[]
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
      // Awaits the promise `createCollectionBackend` already started rather
      // than asking the worker again. Readiness happens once and never goes
      // back, so a repeated question can only get the same answer — but it
      // still cost a full round trip each time, and callers ask often: a
      // repository helper that awaits `collection.ready()` before touching a
      // record turns a thousand-record sync into a thousand extra messages.
      // One app measured 2,273 `isReady` messages in a single session, more
      // than any other message type it produced.
      isReady: async () => {
        await this.collectionReady.get(collection.name)
      },
    }
  }
}
