import type ReactivityAdapter from '../types/ReactivityAdapter'
import EventEmitter from '../utils/EventEmitter'
import type Selector from '../types/Selector'
import type Modifier from '../types/Modifier'
import type Signal from '../types/Signal'
import createSignal from '../utils/createSignal'
import type DataAdapter from '../DataAdapter'
import type { CollectionBackend, QueryOptions } from '../DataAdapter'
import randomId from '../utils/randomId'
import DefaultDataAdapter from '../DefaultDataAdapter'
import type StorageAdapter from '../types/StorageAdapter'
import modify from '../utils/modify'
import deepClone from '../utils/deepClone'
import Cursor from './Cursor'
import type { BaseItem, FieldSpecifier, FindOptions, Transform, TransformAll } from './types'

export type { BaseItem, Transform, TransformAll, SortSpecifier, FieldSpecifier, FindOptions } from './types'
export type { CursorOptions } from './Cursor'
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

interface CollectionEvents<T extends BaseItem, E extends BaseItem = T, U = E> {
  'added': (item: T) => void,
  'changed': (item: T, modifier: Modifier<T>) => void,
  'removed': (item: T) => void,

  'observer.created': <O extends QueryOptions<T>>(selector?: Selector<T>, options?: O) => void,
  'observer.disposed': <O extends QueryOptions<T>>(selector?: Selector<T>, options?: O) => void,

  'getItems': (selector: Selector<T> | undefined) => void,
  'find': <O extends FindOptions<T, Async>, Async extends boolean>(
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
  '_debug.find': <O extends FindOptions<T, Async>, Async extends boolean>(callstack: string, selector: Selector<T> | undefined, options: O | undefined, cursor: Cursor<E, U, Async>) => void,
  '_debug.findOne': <O extends FindOptions<T, Async>, Async extends boolean>(callstack: string, selector: Selector<T>, options: O | undefined, item: U | undefined) => void,
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

  static getCollections() {
    return Collection.collections
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
   * @param callback - The batch operation to execute.
   * @returns A promise if the callback returns a promise, otherwise `void`.
   */
  static batch<ReturnType>(callback: () => Promise<ReturnType>): Promise<void>
  static batch<ReturnType>(callback: () => ReturnType): void
  static batch<ReturnType>(callback: () => ReturnType | Promise<ReturnType>): void | Promise<void> {
    Collection.batchOperationInProgress = true

    const execute = () => Collection.collections.reduce<
      () => ReturnType | Promise<ReturnType>
    >(
      (memo, collection) => () => {
        return collection.batch(memo) as ReturnType | Promise<ReturnType>
      },
      callback,
    )()

    const maybePromise = execute()

    const afterBatch = () => {
      Collection.batchOperationInProgress = false
    }

    if (maybePromise && typeof (maybePromise as any).then === 'function') {
      return (maybePromise as Promise<ReturnType>)
        .then(() => afterBatch())
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
   * @param options.persistence - The persistence adapter for saving and loading items.
   * @param options.indices - An array of index providers for optimized querying.
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
    void this.backend.isReady().then(() => {
      this.readySignal.set(true)
    })

    Collection.onCreationCallbacks.forEach(callback => callback(this))
  }

  public isBatchOperationInProgress() {
    return Collection.batchOperationInProgress || this.batchOperationInProgress
  }

  /**
   * Checks whether the collection is currently performing a pull operation
   * ⚡️ this function is reactive!
   * (loading data from the persistence adapter).
   * @returns A boolean indicating if the collection is in the process of pulling data.
   */
  public isPulling() {
    return this.isPullingSignal.get() ?? false
  }

  /**
   * Checks whether the collection is currently performing a push operation
   * ⚡️ this function is reactive!
   * (saving data to the persistence adapter).
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
   * Resolves when the persistence adapter finished initializing
   * and the collection is ready to be used.
   * @returns A promise that resolves when the collection is ready.
   * @example
   * ```ts
   * const collection = new Collection({
   *   persistence: // ...
   * })
   * await collection.isReady()
   *
   * collection.insert({ name: 'Item 1' })
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
    return this.options.transformAll(items, fields)
  }

  private getItem<
    Async extends boolean,
    O extends Omit<FindOptions<T, Async>, 'limit'> = Omit<FindOptions<T, Async>, 'limit'>,
  >(
    selector: Selector<T> = {},
    options: O,
  ): Async extends true ? Promise<T | undefined> : T | undefined {
    const itemsOrPromise = this.getItems(selector, { ...options, limit: 1 })
    if (itemsOrPromise instanceof Promise) {
      return itemsOrPromise
        .then(items => items[0]) as Async extends true ? Promise<T | undefined> : T | undefined
    }
    return itemsOrPromise[0] as Async extends true ? Promise<T | undefined> : T | undefined
  }

  private getItems<
    Async extends boolean,
    O extends FindOptions<T, Async> = FindOptions<T, Async>,
  >(
    selector: Selector<T> = {},
    options: O,
  ): Async extends true ? Promise<T[]> : T[] {
    this.emit('getItems', selector)
    return this.profile(
      () => {
        const queryItems = () => this.backend.getQueryResult(selector, options)

        if (!options?.async) return queryItems()

        return new Promise<T[]>((resolve, reject) => {
          this.isPullingSignal.set(true)
          const cleanup = this.backend.onQueryStateChange(
            selector,
            options,
            (state) => {
              if (state === 'error') {
                cleanup()
                reject(this.backend.getQueryError(selector, options) || new Error('Unknown error'))
              } else if (state === 'complete') {
                cleanup()
                resolve(queryItems() || [])
              }
            },
          )
          this.backend.registerQuery(selector, options)
        }).finally(() => {
          this.isPullingSignal.set(false)
          this.backend.unregisterQuery(selector, options)
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

  /**
   * Disposes the collection, unregisters persistence adapters, clears memory, and
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
   * @template O - The options type for the find operation.
   * @param [selector] - The criteria to select items.
   * @param [options] - Options for the find operation, such as limit and sort.
   * @returns A cursor to fetch and observe the matching items.
   */
  public find<
    Async extends boolean = false,
    O extends FindOptions<T, Async> = FindOptions<T, Async>,
  >(
    selector: Selector<T> = {},
    options?: O,
  ) {
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
        bindEvents: (requery) => {
          const handleRequery = () => {
            if (this.batchOperationInProgress) {
              this.postBatchCallbacks.add(requery)
              return
            }
            requery()
          }

          this.backend.registerQuery(selector, options)
          const queryStateChangeCleanup = this.backend.onQueryStateChange(
            selector,
            options,
            (state) => {
              if (state !== 'complete') return
              handleRequery()
            },
          )
          this.emit('observer.created', selector, options)
          return () => {
            this.backend.unregisterQuery(selector, options)
            queryStateChangeCleanup()
            this.emit('observer.disposed', selector, options)
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
   * @template Async - Whether to perform the operation asynchronously.
   * @template O - The options type for the find operation.
   * @param selector - The criteria to select the item.
   * @param [options] - Options for the find operation, such as projection.
   * @returns The found item or `undefined`.
   */
  public findOne<
    Async extends boolean = false,
    O extends Omit<FindOptions<T, Async>, 'limit'> = Omit<FindOptions<T, Async>, 'limit'>,
  >(
    selector: Selector<T>,
    options?: O,
  ): Async extends true ? Promise<U | undefined> : U | undefined {
    if (this.isDisposed) throw new Error('Collection is disposed')
    const cursor = this.find<Async, FindOptions<T, Async>>(selector, {
      limit: 1,
      ...options,
    } as FindOptions<T, Async>)
    const handleItems = (items: U[]) => {
      const returnValue = items[0] || undefined
      this.emit('findOne', selector, options, returnValue)
      this.executeInDebugMode(callstack => this.emit('_debug.findOne', callstack, selector, options, returnValue))
      return returnValue
    }

    const maybePromise = cursor.fetch()
    return (maybePromise instanceof Promise
      ? maybePromise.then(handleItems)
      : handleItems(maybePromise)) as Async extends true ? Promise<U | undefined> : U | undefined
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
    const maybePromise = callback()

    const afterBatch = () => {
      this.batchOperationInProgress = false
      this.postBatchCallbacks.forEach(callback_ => callback_())
      this.postBatchCallbacks.clear()
    }

    if (maybePromise && typeof (maybePromise as any).then === 'function') {
      return (maybePromise as Promise<any>).then(() => afterBatch())
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
    if (items.length === 0) {
      return []
    }

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
    const item = await this.getItem<true>(selector, { async: true })
    if (item == null) {
      if (options?.upsert) {
        // if upsert is enabled, insert a new item
        const newItem: Omit<T, 'id'> & Partial<Pick<T, 'id'>> = modify({} as T, {
          ...restModifier,
          $set: {
            ...$setOnInsert,
            ...restModifier.$set,
          },
        })
        await this.insert(newItem as T)
        return 1
      }
      return 0 // no item found, and upsert is not enabled
    }

    const modifiedItem = modify(deepClone(item), restModifier)
    this.emit('validate', modifiedItem)
    const changes = await this.withPushState(() => this.backend.updateOne(selector, modifier))
    this.emit('changed', modifiedItem, restModifier)
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
    const items = await this.getItems<true>(selector, { async: true })
    if (items.length === 0) {
      if (options?.upsert) {
        // if upsert is enabled, insert a new item
        const newItem: Omit<T, 'id'> & Partial<Pick<T, 'id'>> = modify({} as T, {
          ...restModifier,
          $set: {
            ...$setOnInsert,
            ...restModifier.$set,
          },
        })
        await this.insert(newItem as T)
        return 1
      }
      return 0 // no items found, and upsert is not enabled
    }

    items.forEach((item) => {
      const modifiedItem = modify(deepClone(item), restModifier)
      this.emit('validate', modifiedItem)
    })

    const changes = await this.withPushState(() => this.backend.updateMany(selector, modifier))
    changes.forEach((item) => {
      this.emit('changed', item, restModifier)
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

    const item = await this.getItem<true>(selector, { async: true })
    if (item == null) {
      if (options?.upsert) {
        await this.insert(replacement as T)
        return 1
      }
      return 0 // no item found, and upsert is not enabled
    }

    const modifiedItem = { id: item.id, ...replacement } as T
    this.emit('validate', modifiedItem)

    const changes = await this.withPushState(() => this.backend.replaceOne(selector, replacement))

    this.emit('changed', modifiedItem, replacement as Modifier<T>)
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
