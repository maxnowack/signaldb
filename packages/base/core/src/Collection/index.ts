import type ReactivityAdapter from '../types/ReactivityAdapter'
import EventEmitter from '../utils/EventEmitter'
import type Selector from '../types/Selector'
import type Modifier from '../types/Modifier'
import type Signal from '../types/Signal'
import createSignal from '../utils/createSignal'
import type DataAdapter from '../DataAdapter'
import type { CollectionBackend, QueryOptions, WriteResult } from '../DataAdapter'
import randomId from '../utils/randomId'
import DefaultDataAdapter from '../DefaultDataAdapter'
import type StorageAdapter from '../types/StorageAdapter'
import modify from '../utils/modify'
import deepClone from '../utils/deepClone'
import queryId from '../utils/queryId'
import type { QueryDelta } from '../utils/queryDelta'
import Cursor from './Cursor'
import type {
  AsyncFindOptions,
  BaseItem,
  FieldSpecifier,
  FindOptions,
  SyncFindOptions,
  Transform,
  TransformAll,
} from './types'

export type {
  AnyFindOptions,
  AsyncFindOptions,
  BaseItem,
  Transform,
  TransformAll,
  SortSpecifier,
  FieldSpecifier,
  FindOptions,
  SyncFindOptions,
} from './types'
export type { CursorOptions, QueryStateAccessor } from './Cursor'
export type { ObserveCallbacks } from './Observer'
export { default as createIndex } from '../createIndex'

export interface CollectionOptions<T extends BaseItem<I>, I, E extends BaseItem = T, U = E> {
  /**
   * @deprecated Use new constructor parameters instead.
   */
  name?: string,
  /**
   * @deprecated Use `DataAdapter` options instead.
   */
  persistence?: StorageAdapter<T, I>,

  primaryKeyGenerator?: (item: Omit<T, 'id'>) => I,

  reactivity?: ReactivityAdapter,
  transform?: Transform<E, U>,
  transformAll?: TransformAll<T, E>,
  indices?: string[],
  enableDebugMode?: boolean,
  fieldTracking?: boolean,
}

/**
 * Splits what a backend returned from a write into the changed items and their previous state.
 * @param result - What the backend's write method returned.
 * @returns The changed items, and what each of them was before the write. An adapter that cannot
 * report the previous state yields an empty list, and the `'changed'` event omits its third
 * argument.
 */
function splitWriteResult<T extends BaseItem>(result: WriteResult<T>) {
  if (Array.isArray(result)) return { items: result, previousItems: [] as T[] }
  return result
}

interface CollectionEvents<T extends BaseItem, E extends BaseItem = T, U = E> {
  'added': (item: T) => void,
  'changed': (item: T, modifier: Modifier<T>, previousItem?: T) => void,
  'removed': (item: T) => void,

  'observer.created': <O extends QueryOptions<T>>(selector?: Selector<T>, options?: O) => void,
  'observer.disposed': <O extends QueryOptions<T>>(selector?: Selector<T>, options?: O) => void,

  /**
   * A query backing at least one live cursor failed and will not deliver
   * results. The cursor keeps returning its neutral empty value, so without
   * listening here a consumer cannot distinguish failure from "no data".
   */
  'query.error': <O extends QueryOptions<T>>(
    error: Error,
    selector?: Selector<T>,
    options?: O,
  ) => void,

  'getItems': (selector: Selector<T> | undefined) => void,
  'find': <Async extends boolean, O extends FindOptions<T, Async>>(
    selector: Selector<T> | undefined,
    options: O | undefined,
    cursor: Cursor<E, U, Async>,
  ) => void,
  'findOne': <O extends QueryOptions<T>>(
    selector: Selector<T>,
    options: O | undefined,
    item: U | undefined,
  ) => void,
  'insert': (item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => void,
  'updateOne': (selector: Selector<T>, modifier: Modifier<T>) => void,
  'updateMany': (selector: Selector<T>, modifier: Modifier<T>) => void,
  'replaceOne': (selector: Selector<T>, item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => void,
  'removeOne': (selector: Selector<T>) => void,
  'removeMany': (selector: Selector<T>) => void,

  'validate': (item: T) => void,

  '_debug.getItems': (callstack: string, selector: Selector<T> | undefined, measuredTime: number) => void,
  '_debug.find': <Async extends boolean, O extends FindOptions<T, Async>>(callstack: string, selector: Selector<T> | undefined, options: O | undefined, cursor: Cursor<E, U, Async>) => void,
  '_debug.findOne': <Async extends boolean, O extends FindOptions<T, Async>>(callstack: string, selector: Selector<T>, options: O | undefined, item: U | undefined) => void,
  '_debug.insert': (callstack: string, item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => void,
  '_debug.updateOne': (callstack: string, selector: Selector<T>, modifier: Modifier<T>) => void,
  '_debug.updateMany': (callstack: string, selector: Selector<T>, modifier: Modifier<T>) => void,
  '_debug.replaceOne': (callstack: string, selector: Selector<T>, item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => void,
  '_debug.removeOne': (callstack: string, selector: Selector<T>) => void,
  '_debug.removeMany': (callstack: string, selector: Selector<T>) => void,
}

/**
 * Represents a collection of data items with support for in-memory operations,
 * persistence, reactivity, and event-based notifications. The collection provides
 * CRUD operations, observer patterns, and batch operations.
 * @template T - The type of the items stored in the collection.
 * @template I - The type of the unique identifier for the items.
 * @template U - The transformed item type after applying transformations (default is T).
 */
export default class Collection<
  T extends BaseItem<I> = BaseItem,
  I = any,
  E extends BaseItem = T,
  U = E,
> extends EventEmitter<CollectionEvents<T, E, U>> {
  private static collections: Collection<any, any>[] = []
  private static debugMode = false
  private static batchOperationInProgress = false
  private static fieldTracking = false
  private static onCreationCallbacks: ((collection: Collection<any>) => void)[] = []
  private static onDisposeCallbacks: ((collection: Collection<any>) => void)[] = []

  // How many rows a live query may hold before it is reported as expensive.
  // `null` disables the check, which is the default: it costs a stack capture
  // per registered query, which is worth paying while developing and not in
  // production. `enableDebugMode()` turns it on.
  private static largeQueryWarningThreshold: number | null = null
  private static reportedLargeQueries = new Set<string>()

  static getCollections() {
    return Collection.collections
  }

  /**
   * Reports live queries whose result is larger than `rows`, once each, with
   * the stack that registered them.
   *
   * A reactive query is re-evaluated whenever the data under it changes, and
   * one registered from a long-lived place — a navigation bar, a provider
   * near the root — keeps that cost for the lifetime of the application. There
   * is otherwise nothing to see: the query works, and its price is only
   * visible as an application that has grown slow. Finding one such query in a
   * real app took a purpose-built profiler and the better part of a day.
   * @param rows - Result size to report above, or `null` to switch the check off.
   */
  static reportLargeQueries(rows: number | null) {
    Collection.largeQueryWarningThreshold = rows
    if (rows == null) Collection.reportedLargeQueries.clear()
  }

  static onCreation(callback: (collection: Collection<any>) => void) {
    Collection.onCreationCallbacks.push(callback)
  }

  static onDispose(callback: (collection: Collection<any>) => void) {
    Collection.onDisposeCallbacks.push(callback)
  }

  /**
   * Enables debug mode for all collections.
   */
  static enableDebugMode = () => {
    Collection.debugMode = true
    // A query large enough to matter is exactly the kind of thing debug mode
    // exists to surface, and it is invisible otherwise. Call
    // `reportLargeQueries()` afterwards to pick a different threshold or turn
    // it off again.
    if (Collection.largeQueryWarningThreshold == null) Collection.reportLargeQueries(500)
    Collection.collections.forEach((collection) => {
      collection.setDebugMode(true)
    })
  }

  /**
   * Enables field tracking for all collections.
   * @param enable - A boolean indicating whether to enable field tracking.
   */
  static setFieldTracking = (enable: boolean) => {
    Collection.fieldTracking = enable
    Collection.collections.forEach((collection) => {
      collection.setFieldTracking(enable)
    })
  }

  /**
   * Executes a batch operation, allowing multiple modifications to the collection
   * while deferring index rebuilding until all operations in the batch are completed.
   * This improves performance by avoiding repetitive index recalculations and
   * provides atomicity for the batch of operations.
   * Supports both synchronous and asynchronous callbacks.
   *
   * **Without a `collections` argument this affects every collection in the
   * process, not only the ones being written to.** Each of them defers every
   * live query's requery until the batch ends. That is what makes a batch
   * cheap for a handful of writes belonging to one event, and what makes it
   * dangerous around a loop whose length is data-dependent: while it is open
   * nothing anywhere updates, and everything deferred is flushed at once when
   * it closes. One application wrapped a sync of roughly 1,100 records this
   * way and its screens stopped resolving their data for the whole drain.
   *
   * Pass the collections being written to whenever that scope is known — it is
   * both cheaper and safer. `Collection.batch([logs, versions], () => …)`
   * defers those two and leaves everything else live.
   * @param collections - The collections to batch. Omit to batch all of them.
   * @param callback - The batch operation to execute.
   * @returns A promise if the callback returns a promise, otherwise `void`.
   */
  static batch<ReturnType>(callback: () => Promise<ReturnType>): Promise<void>
  static batch<ReturnType>(callback: () => ReturnType): void
  static batch<ReturnType>(
    collections: Collection<any, any, any, any>[],
    callback: () => Promise<ReturnType>,
  ): Promise<void>

  static batch<ReturnType>(
    collections: Collection<any, any, any, any>[],
    callback: () => ReturnType,
  ): void

  static batch<ReturnType>(
    collectionsOrCallback: Collection<any, any, any, any>[]
      | (() => ReturnType | Promise<ReturnType>),
    maybeCallback?: () => ReturnType | Promise<ReturnType>,
  ): void | Promise<void> {
    const scoped = Array.isArray(collectionsOrCallback)
    const callback = (scoped ? maybeCallback : collectionsOrCallback) as
      () => ReturnType | Promise<ReturnType>
    if (typeof callback !== 'function') throw new TypeError('Collection.batch requires a callback')
    const collections = scoped ? collectionsOrCallback : Collection.collections

    // Only a batch that really covers every collection may claim the global
    // flag; a scoped one must not make unrelated collections report themselves
    // as batching through `isBatchOperationInProgress()`.
    if (!scoped) Collection.batchOperationInProgress = true

    const execute = () => collections.reduce<
      () => ReturnType | Promise<ReturnType>
    >(
      (memo, collection) => () => {
        return collection.batch(memo) as ReturnType | Promise<ReturnType>
      },
      callback,
    )()

    const afterBatch = () => {
      if (!scoped) Collection.batchOperationInProgress = false
    }

    let maybePromise: ReturnType | Promise<ReturnType>
    try {
      maybePromise = execute()
    } catch (error) {
      // A synchronously throwing callback must not leave the batch flag
      // stuck at `true` — that would defer every requery forever (see the
      // rejection branch below).
      afterBatch()
      throw error
    }

    if (maybePromise && typeof (maybePromise as any).then === 'function') {
      return (maybePromise as Promise<ReturnType>)
        .then(
          () => afterBatch(),
          (error) => {
            // Rejections need the same cleanup as fulfillment — otherwise
            // `batchOperationInProgress` stays `true` and all deferred
            // requeries are never flushed, silently freezing reactivity.
            afterBatch()
            throw error
          },
        )
    } else {
      afterBatch()
    }
  }

  public readonly name: string
  private backend: CollectionBackend<T, I>
  private options: CollectionOptions<T, I, E, U>
  private isPullingSignal: Signal<boolean>
  private isPushingSignal: Signal<boolean>
  private readySignal: Signal<boolean>
  private debugMode
  private batchOperationInProgress = false
  private isDisposed = false
  private postBatchCallbacks = new Set<() => void>()
  private fieldTracking = false
  private queryListenersMap: Map<string, number> = new Map()
  // Which registered queries have delivered an outcome at least once, backing
  // `Cursor#isLoading()`. Kept here rather than on a cursor because a cursor is
  // rebuilt on every reactive re-run, and rather than in the data adapters
  // because deriving it from the state they already publish needs no change to
  // the `CollectionBackend` contract. Keyed and dropped exactly like
  // `queryListenersMap`, so a query that gets unregistered starts out pending
  // again — which is correct, since the adapter re-executes it on the next
  // registration.
  private settledQueriesSet: Set<string> = new Set()

  /**
   * Initializes a new instance of the `Collection` class with optional configuration.
   * Sets up memory, persistence, reactivity, and indices as specified in the options.
   * @template T - The type of the items stored in the collection.
   * @template I - The type of the unique identifier for the items.
   * @template U - The transformed item type after applying transformations (default is T).
   * @param name - The name of the collection.
   * @param dataAdapter - The data adapter for creating the collection backend.
   * @param options - Optional configuration for the collection.
   * @param options.name - An optional name for the collection.
   * @param options.memory - The in-memory adapter for storing items.
   * @param options.reactivity - The reactivity adapter for observing changes in the collection.
   * @param options.transform - A transformation function to apply to items when retrieving them.
   * @param options.persistence - Deprecated. A storage adapter for saving and loading items; pass a `DataAdapter` instead.
   * @param options.indices - An array of field names to index for optimized querying.
   * @param options.enableDebugMode - A boolean to enable or disable debug mode.
   * @param options.fieldTracking - A boolean to enable or disable field tracking by default.
   * @param options.transformAll - A function that will be able to solve the n+1 problem
   */
  constructor(options?: CollectionOptions<T, I, E, U>)
  constructor(name: string, dataAdapter: DataAdapter, options?: CollectionOptions<T, I, E, U>)
  constructor(
    nameOrOptions: string | CollectionOptions<T, I, E, U> | undefined,
    maybeDataAdapter?: DataAdapter,
    maybeOptions?: CollectionOptions<T, I, E, U>,
  ) {
    super()

    const name = typeof nameOrOptions === 'string'
      ? nameOrOptions
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      : nameOrOptions?.name || `${this.constructor.name}-${randomId()}`
    const options = typeof nameOrOptions === 'string'
      ? maybeOptions || {}
      : nameOrOptions || {}

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const persistence = options.persistence
    const dataAdapter = maybeDataAdapter || new DefaultDataAdapter({
      ...persistence ? { storage: () => persistence } : {},
    })

    Collection.collections.push(this)
    this.name = name
    this.options = { ...options }
    this.fieldTracking = this.options.fieldTracking ?? Collection.fieldTracking
    this.debugMode = this.options.enableDebugMode ?? Collection.debugMode

    this.isPullingSignal = createSignal(this.options.reactivity, false)
    this.isPushingSignal = createSignal(this.options.reactivity, false)
    this.readySignal = createSignal(this.options.reactivity, false)

    this.backend = dataAdapter.createCollectionBackend<T, I, E, U>(
      this,
      this.options.indices ?? [],
    )
    void this.backend.isReady()
      .then(() => {
        this.readySignal.set(true)
      })
      .catch(() => { /* initialization failed; keep not-ready state */ })

    Collection.onCreationCallbacks.forEach(callback => callback(this))
  }

  /**
   * Reports a live query the first time its result is found to be larger than
   * the configured threshold. Once per query, because it re-runs on every
   * write and a warning per write would be its own performance problem.
   * @param selector - The query's selector.
   * @param options - The query's options.
   * @param registrationStack - Where the query was registered, if captured.
   */
  private reportIfLargeQuery(
    selector: Selector<T>,
    options: QueryOptions<T> | undefined,
    registrationStack: string | undefined,
  ) {
    const threshold = Collection.largeQueryWarningThreshold
    if (threshold == null) return
    const id = `${this.name}:${queryId(selector, options)}`
    if (Collection.reportedLargeQueries.has(id)) return

    const rows = this.backend.getQueryResult(selector, options || {}).length
    if (rows <= threshold) return
    Collection.reportedLargeQueries.add(id)

    // The selector's *keys*, never its values: the shape is what identifies the
    // problem — an empty one means the query holds the whole collection — and
    // the values would put user data into a log.
    const keys = selector && typeof selector === 'object' ? Object.keys(selector) : []
    // eslint-disable-next-line no-console
    console.warn(
      `[SignalDB] Live query on "${this.name}" holds ${rows} rows `
      + `with selector {${keys.join(', ')}}. It is re-evaluated on every write to this `
      + `collection, for as long as it stays registered. ${registrationStack ?? ''}`,
    )
  }

  public isBatchOperationInProgress() {
    return Collection.batchOperationInProgress || this.batchOperationInProgress
  }

  /**
   * Checks whether the collection is currently performing a pull operation
   * ⚡️ this function is reactive!
   * (loading data from storage).
   * @returns A boolean indicating if the collection is in the process of pulling data.
   */
  public isPulling() {
    return this.isPullingSignal.get() ?? false
  }

  /**
   * Checks whether the collection is currently performing a push operation
   * ⚡️ this function is reactive!
   * (saving data to storage).
   * @returns A boolean indicating if the collection is in the process of pushing data.
   */
  public isPushing() {
    return this.isPushingSignal.get() ?? false
  }

  /**
   * Checks whether the collection is currently performing either a pull or push operation,
   * ⚡️ this function is reactive!
   * indicating that it is loading or saving data.
   * @returns A boolean indicating if the collection is in the process of loading or saving data.
   */
  public isLoading() {
    const isPulling = this.isPulling()
    const isPushing = this.isPushing()
    return isPulling || isPushing
  }

  /**
   * Retrieves the current debug mode status of the collection.
   * @returns A boolean indicating whether debug mode is enabled for the collection.
   */
  public getDebugMode() {
    return this.debugMode
  }

  /**
   * Enables or disables debug mode for the collection.
   * When debug mode is enabled, additional debugging information and events are emitted.
   * @param enable - A boolean indicating whether to enable (`true`) or disable (`false`) debug mode.
   */
  public setDebugMode(enable: boolean) {
    this.debugMode = enable
  }

  /**
   * Enables or disables field tracking for the collection.
   * @param enable - A boolean indicating whether to enable (`true`) or disable (`false`) field tracking.
   */
  public setFieldTracking(enable: boolean) {
    this.fieldTracking = enable
  }

  /**
   * Resolves when the storage adapter finished initializing
   * and the collection is ready to be used.
   * @returns A promise that resolves when the collection is ready.
   * @example
   * ```ts
   * const collection = new Collection('items', dataAdapter)
   * await collection.ready()
   *
   * await collection.insert({ name: 'Item 1' })
   * ```
   */
  public async ready() {
    return this.backend.isReady()
  }

  /**
   * Checks if the collection is ready.
   * ⚡️ this function is reactive!
   * @returns A boolean indicating whether the collection is ready.
   */
  public isReady() {
    return this.readySignal.get() ?? false
  }

  private profile<ReturnValue>(
    fn: () => ReturnValue,
    measureFunction: (measuredTime: number) => void,
  ) {
    if (!this.debugMode) return fn()
    const startTime = performance.now()
    const handleProfileEnd = (result: ReturnValue) => {
      const endTime = performance.now()
      measureFunction(endTime - startTime)
      return result
    }
    const maybePromise = fn()
    return maybePromise instanceof Promise
      ? maybePromise.then(handleProfileEnd)
      : handleProfileEnd(maybePromise)
  }

  private executeInDebugMode(fn: (callstack: string) => void) {
    if (!this.debugMode) return
    // eslint-disable-next-line unicorn/error-message
    const callstack = new Error().stack || ''
    fn(callstack)
  }

  private transform(item: E): U {
    if (!this.options.transform) return item as unknown as U
    return this.options.transform(item)
  }

  private transformAll(items: T[], fields?: FieldSpecifier<T>): E[] {
    if (!this.options.transformAll) return items as unknown as E[]
    return this.options.transformAll(deepClone(items), fields)
  }

  private getItem<
    Async extends boolean,
    O extends Omit<FindOptions<T, Async>, 'limit'> = Omit<FindOptions<T, Async>, 'limit'>,
  >(
    selector: Selector<T>,
    options: O,
  ): Async extends true ? Promise<T | undefined> : T | undefined {
    const itemsOrPromise = this.getItems(selector, { ...options, limit: 1 })
    if (itemsOrPromise instanceof Promise) {
      return itemsOrPromise.then((items) => {
        return items[0] || undefined
      }) as Async extends true ? Promise<T | undefined> : T | undefined
    }
    return itemsOrPromise[0] as Async extends true ? Promise<T | undefined> : T | undefined
  }

  private getItems<
    Async extends boolean,
    O extends FindOptions<T, Async> = FindOptions<T, Async>,
  >(
    selector: Selector<T>,
    options: O,
  ): Async extends true ? Promise<T[]> : T[] {
    this.emit('getItems', selector)
    return this.profile(
      () => {
        if (!options?.async) return this.backend.getQueryResult(selector, options)

        this.isPullingSignal.set(true)
        return this.backend.executeQuery(selector, options)
          .finally(() => {
            this.isPullingSignal.set(false)
          })
      },
      measuredTime => this.executeInDebugMode(callstack => this.emit('_debug.getItems', callstack, selector, measuredTime)),
    ) as Async extends true ? Promise<T[]> : T[]
  }

  private async withPushState<ReturnType>(
    asyncFunction: () => Promise<ReturnType>,
  ): Promise<ReturnType> {
    this.isPushingSignal.set(true)
    try {
      return await asyncFunction()
    } finally {
      this.isPushingSignal.set(false)
    }
  }

  private queryListeners(
    query: { selector: Selector<T>, options?: QueryOptions<T> },
  ): number

  private queryListeners(
    query: { selector: Selector<T>, options?: QueryOptions<T> },
    listeners: number,
  ): void

  private queryListeners(
    query: { selector: Selector<T>, options?: QueryOptions<T> },
    listeners?: number,
  ) {
    const id = queryId(query.selector, query.options)
    if (listeners != null) {
      return this.queryListenersMap.set(id, listeners)
    }
    return this.queryListenersMap.get(id) ?? 0
  }

  /**
   * Disposes the collection, unregisters storage adapters, clears memory, and
   * cleans up all resources used by the collection.
   * @returns A promise that resolves when the collection is disposed.
   */
  public async dispose() {
    await this.backend.dispose()
    this.isDisposed = true
    this.removeAllListeners()
    Collection.collections = Collection.collections.filter(collection => collection !== this)
    Collection.onDisposeCallbacks.forEach(callback => callback(this))
  }

  /**
   * Finds multiple items in the collection based on a selector and optional options.
   * Returns a cursor for reactive data queries.
   * @param [selector] - The criteria to select items.
   * @param [options] - Options for the find operation, such as limit and sort.
   * @returns A cursor to fetch and observe the matching items.
   */
  public find(
    selector?: Selector<T>,
    options?: SyncFindOptions<T>,
  ): Cursor<E, U, false>

  public find(
    selector: Selector<T> | undefined,
    options: AsyncFindOptions<T>,
  ): Cursor<E, U, true>

  public find(
    selector?: Selector<T>,
    options?: FindOptions<T, boolean>,
  ): Cursor<E, U, boolean>

  public find<Async extends boolean>(
    selector: Selector<T> = {},
    options?: FindOptions<T, Async>,
  ): Cursor<E, U, Async> {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (selector !== undefined && (!selector || typeof selector !== 'object')) throw new Error('Invalid selector')
    const getTransformedItems = () => {
      const itemsOrPromise = this.getItems(selector, options || {})
      if (itemsOrPromise instanceof Promise) {
        return itemsOrPromise.then((items) => {
          return this.transformAll(items, options?.fields)
        })
      }
      const items = itemsOrPromise
      return this.transformAll(items, options?.fields)
    }
    const cursor = new Cursor<E, U, Async>(
      getTransformedItems as Async extends true
        ? () => Promise<E[]>
        : () => E[],
      {
        reactive: this.options.reactivity,
        fieldTracking: this.fieldTracking,
        ...options,
        transform: this.transform.bind(this),
        queryState: {
          hasSettled: () => {
            if (this.settledQueriesSet.has(queryId(selector, options))) return true
            // An adapter that answers synchronously reports `'complete'` from
            // the start, so a cursor over one is never in a loading state.
            const state = this.backend.getQueryState(selector, options || {})
            return state === 'complete' || state === 'error'
          },
          // The latch is set by the very callback that notifies, so a cursor
          // can never be woken to read a state that has not been recorded yet,
          // whatever order the backend runs its subscribers in.
          onSettled: callback => this.backend.onQueryStateChange(
            selector,
            options || {},
            (state) => {
              if (state !== 'complete' && state !== 'error') return
              this.settledQueriesSet.add(queryId(selector, options))
              callback()
            },
          ),
        },
        bindEvents: (requery, applyDelta) => {
          const handleRequery = () => {
            if (this.batchOperationInProgress) {
              this.postBatchCallbacks.add(requery)
              return
            }
            requery()
          }

          // A `transformAll` sits between the backend's result and what the cursor holds, and it
          // is free to produce anything at all — so a delta describing the backend's result says
          // nothing about the cursor's. Those collections keep comparing.
          const canApplyDeltas = !this.options.transformAll && !options?.async

          // register query if not yet registered
          const listeners = this.queryListeners({ selector, options })
          const didRegister = listeners === 0
          if (didRegister) this.backend.registerQuery(selector, options || {})
          this.queryListeners({ selector, options }, listeners + 1)

          // Captured at registration, not at completion: by the time the result
          // arrives the stack is the adapter's, and the only useful thing to
          // report is where the query was asked for.
          const registrationStack = didRegister && Collection.largeQueryWarningThreshold != null
            ? new Error('query registered here').stack
            : undefined
          // A synchronous adapter already holds the result here and never
          // reports `'complete'`, so the check has to happen at both points.
          // Reporting is once per query, which makes the overlap harmless.
          if (didRegister) this.reportIfLargeQuery(selector, options, registrationStack)

          const queryStateChangeCleanup = this.backend.onQueryStateChange(
            selector,
            options || {},
            (state, delta) => {
              // A failed query never reaches `'complete'`, so the cursor keeps
              // serving its neutral empty value — indistinguishable from "no
              // data" for anyone reading it. Surfacing the failure as an event
              // is the only way a consumer can tell the difference. Requerying
              // here would be pointless (the backend result is still empty)
              // and risks a loop, so it deliberately does not.
              if (state === 'error') {
                const queryError = this.backend.getQueryError(selector, options || {})
                  || new Error(`Query on "${this.name}" failed`)
                this.emit('query.error', queryError, selector, options)
                return
              }
              if (state !== 'complete') return
              this.reportIfLargeQuery(selector, options, registrationStack)
              // Inside a batch the update is deferred to the end of it, by which point this delta
              // is one of several and no longer describes the whole change — so the batch always
              // ends in a comparison.
              if (delta != null && canApplyDeltas && !this.batchOperationInProgress) {
                applyDelta(delta as unknown as QueryDelta<E>)
                return
              }
              handleRequery()
            },
          )
          this.emit('observer.created', selector, options)
          return () => {
            // Use queueMicrotask instead of setTimeout to avoid race conditions
            // while still allowing batching of quick register/unregister calls
            queueMicrotask(() => {
              // unregister query if no more listeners
              const newListeners = Math.max(0, this.queryListeners({ selector, options }) - 1)
              // The count decides, and only the count. Asking additionally whether *this*
              // observer was the one that registered leaks the query permanently: a rerun that
              // creates its replacement before the old one's cleanup runs — which the microtask
              // above deliberately allows — hands the count to an observer for which
              // `didRegister` is false, and when that one is disposed the count reaches zero with
              // nobody left who is allowed to act on it. The backend keeps the query registered
              // and maintains its result on every write for the rest of the session, while
              // `queryListeners` reads zero, so the next observer registers it a second time and
              // is answered with the whole result again.
              //
              // The race that guard was written for is already covered here: an observer that
              // registered in the meantime has incremented the count, so `newListeners` is not
              // zero and nothing is unregistered.
              if (newListeners === 0) {
                this.backend.unregisterQuery(selector, options || {})
                this.settledQueriesSet.delete(queryId(selector, options))
              }
              this.queryListeners({ selector, options }, newListeners)

              queryStateChangeCleanup()
              this.emit('observer.disposed', selector, options)
            })
          }
        },
      })
    this.emit('find', selector, options, cursor)
    this.executeInDebugMode(callstack => this.emit('_debug.find', callstack, selector, options, cursor))
    return cursor
  }

  /**
   * Finds a single item in the collection based on a selector and optional options.
   * ⚡️ this function is reactive!
   * Returns the found item or undefined if no item matches.
   * @param selector - The criteria to select the item.
   * @param [options] - Options for the find operation, such as projection.
   * @returns The found item or `undefined`.
   */
  public findOne(
    selector: Selector<T>,
    options?: Omit<SyncFindOptions<T>, 'limit'>,
  ): U | undefined

  public findOne(
    selector: Selector<T>,
    options: Omit<AsyncFindOptions<T>, 'limit'>,
  ): Promise<U | undefined>

  public findOne(
    selector: Selector<T>,
    options?: Omit<FindOptions<T, boolean>, 'limit'>,
  ): Promise<U | undefined> | U | undefined

  public findOne(
    selector: Selector<T>,
    options?: Omit<FindOptions<T, boolean>, 'limit'>,
  ): Promise<U | undefined> | U | undefined {
    if (this.isDisposed) throw new Error('Collection is disposed')
    const cursor = this.find(selector, {
      limit: 1,
      ...options,
    } as FindOptions<T, boolean>)
    const handleItems = (items: U[]) => {
      const returnValue = items[0] || undefined
      this.emit('findOne', selector, options, returnValue)
      this.executeInDebugMode(callstack => this.emit('_debug.findOne', callstack, selector, options, returnValue))
      return returnValue
    }

    const maybePromise = cursor.fetch()
    return (maybePromise instanceof Promise
      ? maybePromise.then(handleItems)
      : handleItems(maybePromise))
  }

  /**
   * Performs a batch operation, deferring index rebuilds and allowing multiple
   * modifications to be made atomically. Executes any post-batch callbacks afterwards.
   * @param callback - The batch operation to execute.
   * @returns A promise if the callback returns a promise, otherwise void.
   */
  public batch<ReturnType>(callback: () => Promise<ReturnType>): Promise<void>
  public batch<ReturnType>(callback: () => ReturnType): void
  public batch<ReturnType>(callback: () => ReturnType | Promise<ReturnType>): void | Promise<void> {
    if (this.batchOperationInProgress) return callback() as void | Promise<void>
    this.batchOperationInProgress = true

    const afterBatch = () => {
      this.batchOperationInProgress = false
      this.postBatchCallbacks.forEach(callback_ => callback_())
      this.postBatchCallbacks.clear()
    }

    let maybePromise: ReturnType | Promise<ReturnType>
    try {
      maybePromise = callback()
    } catch (error) {
      // A synchronously throwing callback must not leave the batch flag
      // stuck at `true` — that would defer every requery forever (see the
      // rejection branch below).
      afterBatch()
      throw error
    }

    if (maybePromise && typeof (maybePromise as any).then === 'function') {
      return (maybePromise as Promise<any>).then(
        () => afterBatch(),
        (error) => {
          // Rejections need the same cleanup as fulfillment — otherwise
          // `batchOperationInProgress` stays `true`, deferred post-batch
          // callbacks (e.g. reactive requeries) are never flushed and
          // reactivity silently freezes for the rest of the session.
          afterBatch()
          throw error
        },
      )
    } else {
      afterBatch()
    }
  }

  public onPostBatch(callback: () => void) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (this.batchOperationInProgress) {
      this.postBatchCallbacks.add(callback)
      return
    }
    return callback()
  }

  /**
   * Inserts a single item into the collection. Generates a unique ID if not provided.
   * @param item - The item to insert.
   * @returns The ID of the inserted item.
   * @throws {Error} If the collection is disposed or the item has an invalid ID.
   */
  public async insert(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!item) throw new Error('Invalid item')

    const primaryKeyGenerator = this.options.primaryKeyGenerator ?? randomId
    const itemWithId = {
      id: primaryKeyGenerator(item) as I,
      ...item,
    } as T
    this.emit('validate', itemWithId)

    const newItem = await this.withPushState(() => this.backend.insert(itemWithId))

    this.emit('added', newItem)
    this.emit('insert', newItem)
    this.executeInDebugMode(callstack => this.emit('_debug.insert', callstack, newItem))
    return newItem.id
  }

  /**
   * Inserts multiple items into the collection. Generates unique IDs for items if not provided.
   * @param items - The items to insert.
   * @returns An array of IDs of the inserted items.
   * @throws {Error} If the collection is disposed or the items are invalid.
   */
  public async insertMany(items: Array<Omit<T, 'id'> & Partial<Pick<T, 'id'>>>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!items) throw new Error('Invalid items')
    if (items.length === 0) return []

    const ids: I[] = []
    await this.batch(async () => {
      await Promise.all(items.map(async (item) => {
        ids.push(await this.insert(item))
      }))
    })
    return ids
  }

  /**
   * Updates a single item in the collection that matches the given selector.
   * @param selector - The criteria to select the item to update.
   * @param modifier - The modifications to apply to the item.
   * @param [options] - Optional settings for the update operation.
   * @param [options.upsert] - If `true`, creates a new item if no item matches the selector.
   * @returns The number of items updated (0 or 1).
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public async updateOne(
    selector: Selector<T>,
    modifier: Modifier<T>,
    options?: { upsert?: boolean },
  ) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')
    if (!modifier) throw new Error('Invalid modifier')

    const { $setOnInsert, ...restModifier } = modifier

    // Reading the item back before writing it is worth a round trip to the data layer only when
    // something is waiting to inspect it: a validator gets to refuse the write, and it can only do
    // that beforehand. Otherwise the backend's own answer says everything there is to know — what
    // it returns is what changed, and an empty answer is what turns an upsert into an insert.
    if (this.listenerCount('validate') > 0) {
      const item = await this.getItem<true>(selector, { async: true })
      if (item != null) this.emit('validate', modify(deepClone(item), restModifier))
    }

    const { items: changes, previousItems } = splitWriteResult(
      await this.withPushState(() => this.backend.updateOne(selector, modifier)),
    )
    if (changes.length === 0) {
      if (!options?.upsert) return 0 // no item found, and upsert is not enabled
      const newItem: Omit<T, 'id'> & Partial<Pick<T, 'id'>> = modify({} as T, {
        ...restModifier,
        $set: {
          ...$setOnInsert,
          ...restModifier.$set,
        },
      })
      await this.insert(newItem)
      return 1
    }

    changes.forEach((item, index) => this.emit('changed', item, restModifier, previousItems[index]))
    this.emit('updateOne', selector, modifier)
    this.executeInDebugMode(callstack => this.emit('_debug.updateOne', callstack, selector, modifier))
    return changes.length
  }

  /**
   * Updates multiple items in the collection that match the given selector.
   * @param selector - The criteria to select the items to update.
   * @param modifier - The modifications to apply to the items.
   * @param [options] - Optional settings for the update operation.
   * @param [options.upsert] - If `true`, creates new items if no items match the selector.
   * @returns The number of items updated.
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public async updateMany(
    selector: Selector<T>,
    modifier: Modifier<T>,
    options?: { upsert?: boolean },
  ) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')
    if (!modifier) throw new Error('Invalid modifier')
    const { $setOnInsert, ...restModifier } = modifier

    // See `updateOne`: the items are only fetched up front for the sake of a validator.
    if (this.listenerCount('validate') > 0) {
      const items = await this.getItems<true>(selector, { async: true })
      items.forEach((item) => {
        this.emit('validate', modify(deepClone(item), restModifier))
      })
    }

    const { items: changes, previousItems } = splitWriteResult(
      await this.withPushState(() => this.backend.updateMany(selector, modifier)),
    )
    if (changes.length === 0) {
      if (!options?.upsert) return 0 // no items found, and upsert is not enabled
      const newItem: Omit<T, 'id'> & Partial<Pick<T, 'id'>> = modify({} as T, {
        ...restModifier,
        $set: {
          ...$setOnInsert,
          ...restModifier.$set,
        },
      })
      await this.insert(newItem)
      return 1
    }

    changes.forEach((item, index) => {
      this.emit('changed', item, restModifier, previousItems[index])
    })
    this.emit('updateMany', selector, modifier)
    this.executeInDebugMode(callstack => this.emit('_debug.updateMany', callstack, selector, modifier))
    return changes.length
  }

  /**
   * Replaces a single item in the collection that matches the given selector.
   * @param selector - The criteria to select the item to replace.
   * @param replacement - The item to replace the selected item with.
   * @param [options] - Optional settings for the replace operation.
   * @param [options.upsert] - If `true`, creates a new item if no item matches the selector.
   * @returns The number of items replaced (0 or 1).
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public async replaceOne(
    selector: Selector<T>,
    replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>,
    options?: { upsert?: boolean },
  ) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')

    // See `updateOne`: the item is only fetched up front for the sake of a validator.
    if (this.listenerCount('validate') > 0) {
      const item = await this.getItem<true>(selector, { async: true })
      if (item != null) this.emit('validate', { id: item.id, ...replacement } as T)
    }

    const { items: changes, previousItems } = splitWriteResult(
      await this.withPushState(() => this.backend.replaceOne(selector, replacement)),
    )
    if (changes.length === 0) {
      if (!options?.upsert) return 0 // no item found, and upsert is not enabled
      await this.insert(replacement)
      return 1
    }

    changes.forEach((item, index) => this.emit('changed', item, replacement as Modifier<T>, previousItems[index]))
    this.emit('replaceOne', selector, replacement)
    this.executeInDebugMode(callstack => this.emit('_debug.replaceOne', callstack, selector, replacement))
    return changes.length
  }

  /**
   * Removes a single item from the collection that matches the given selector.
   * @param selector - The criteria to select the item to remove.
   * @returns The number of items removed (0 or 1).
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public async removeOne(selector: Selector<T>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')

    const removedItems = await this.withPushState(() => this.backend.removeOne(selector))

    this.emit('removed', removedItems[0])
    this.emit('removeOne', selector)
    this.executeInDebugMode(callstack => this.emit('_debug.removeOne', callstack, selector))
    return removedItems.length
  }

  /**
   * Removes multiple items from the collection that match the given selector.
   * @param selector - The criteria to select the items to remove.
   * @returns The number of items removed.
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public async removeMany(selector: Selector<T>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')

    const removedItems = await this.withPushState(() => this.backend.removeMany(selector))

    removedItems.forEach((item) => {
      this.emit('removed', item)
    })

    this.emit('removeMany', selector)
    this.executeInDebugMode(callstack => this.emit('_debug.removeMany', callstack, selector))
    return removedItems.length
  }
}
