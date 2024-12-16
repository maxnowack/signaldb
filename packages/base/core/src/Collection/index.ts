import type MemoryAdapter from '../types/MemoryAdapter'
import type ReactivityAdapter from '../types/ReactivityAdapter'
import type PersistenceAdapter from '../types/PersistenceAdapter'
import EventEmitter from '../types/EventEmitter'
import type Selector from '../types/Selector'
import type Modifier from '../types/Modifier'
import type IndexProvider from '../types/IndexProvider'
import type { LowLevelIndexProvider } from '../types/IndexProvider'
import match from '../utils/match'
import modify from '../utils/modify'
import isEqual from '../utils/isEqual'
import randomId from '../utils/randomId'
import deepClone from '../utils/deepClone'
import type { Changeset, LoadResponse } from '../types/PersistenceAdapter'
import serializeValue from '../utils/serializeValue'
import type Signal from '../types/Signal'
import createSignal from '../utils/createSignal'
import Cursor from './Cursor'
import type { BaseItem, FindOptions, Transform } from './types'
import getIndexInfo from './getIndexInfo'
import { createExternalIndex } from './createIndex'

export type { BaseItem, Transform, SortSpecifier, FieldSpecifier, FindOptions } from './types'
export type { CursorOptions } from './Cursor'
export type { ObserveCallbacks } from './Observer'
export { default as createIndex } from './createIndex'

export interface CollectionOptions<T extends BaseItem<I>, I, U = T> {
  memory?: MemoryAdapter,
  reactivity?: ReactivityAdapter,
  transform?: Transform<T, U>,
  persistence?: PersistenceAdapter<T, I>,
  indices?: IndexProvider<T, I>[],
  enableDebugMode?: boolean,
  fieldTracking?: boolean,
}

interface CollectionEvents<T extends BaseItem, U = T> {
  added: (item: T) => void,
  changed: (item: T, modifier: Modifier<T>) => void,
  removed: (item: T) => void,

  'persistence.init': () => void,
  'persistence.error': (error: Error) => void,
  'persistence.transmitted': () => void,
  'persistence.received': () => void,
  'persistence.pullStarted': () => void,
  'persistence.pullCompleted': () => void,
  'persistence.pushStarted': () => void,
  'persistence.pushCompleted': () => void,

  'observer.created': <O extends FindOptions<T>>(selector?: Selector<T>, options?: O) => void,
  'observer.disposed': <O extends FindOptions<T>>(selector?: Selector<T>, options?: O) => void,

  getItems: (selector: Selector<T> | undefined) => void,
  find: <O extends FindOptions<T>>(
    selector: Selector<T> | undefined,
    options: O | undefined,
    cursor: Cursor<T, U>,
  ) => void,
  findOne: <O extends FindOptions<T>>(
    selector: Selector<T>,
    options: O | undefined,
    item: U | undefined,
  ) => void,
  insert: (item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => void,
  updateOne: (selector: Selector<T>, modifier: Modifier<T>) => void,
  updateMany: (selector: Selector<T>, modifier: Modifier<T>) => void,
  removeOne: (selector: Selector<T>) => void,
  removeMany: (selector: Selector<T>) => void,

  '_debug.getItems': (callstack: string, selector: Selector<T> | undefined, measuredTime: number) => void,
  '_debug.find': <O extends FindOptions<T>>(callstack: string, selector: Selector<T> | undefined, options: O | undefined, cursor: Cursor<T, U>) => void,
  '_debug.findOne': <O extends FindOptions<T>>(callstack: string, selector: Selector<T>, options: O | undefined, item: U | undefined) => void,
  '_debug.insert': (callstack: string, item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => void,
  '_debug.updateOne': (callstack: string, selector: Selector<T>, modifier: Modifier<T>) => void,
  '_debug.updateMany': (callstack: string, selector: Selector<T>, modifier: Modifier<T>) => void,
  '_debug.removeOne': (callstack: string, selector: Selector<T>) => void,
  '_debug.removeMany': (callstack: string, selector: Selector<T>) => void,
}

/**
 * Checks if there are any pending updates in the given changeset.
 * @template T - The type of the items in the changeset.
 * @param pendingUpdates - The changeset to check for pending updates.
 * @returns `true` if there are pending updates, otherwise `false`.
 */
function hasPendingUpdates<T>(pendingUpdates: Changeset<T>) {
  return pendingUpdates.added.length > 0
    || pendingUpdates.modified.length > 0
    || pendingUpdates.removed.length > 0
}

/**
 * Applies updates (add, modify, remove) to a collection of current items.
 * @template T - The type of the items being updated.
 * @template I - The type of the unique identifier for the items.
 * @param currentItems - The current list of items.
 * @param changeset - The changeset containing added, modified, and removed items.
 * @param changeset.added An array of items to be added to the collection.
 * @param changeset.modified An array of items to replace existing items in the collection. Matching is based on item `id`.
 * @param changeset.removed An array of items to be removed from the collection. Matching is based on item `id`.
 * @returns A new array with the updates applied.
 */
function applyUpdates<T extends BaseItem<I> = BaseItem, I = any>(
  currentItems: T[],
  { added, modified, removed }: Changeset<T>,
) {
  const items = currentItems.slice()
  added.forEach((item) => {
    items.push(item)
  })
  modified.forEach((item) => {
    const index = items.findIndex(({ id }) => id === item.id)
    if (index === -1) return
    items[index] = item
  })
  removed.forEach((item) => {
    const index = items.findIndex(({ id }) => id === item.id)
    if (index === -1) return
    items.splice(index, 1)
  })
  return items
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
  U = T,
> extends EventEmitter<CollectionEvents<T, U>> {
  static collections: Collection<any, any>[] = []
  static debugMode = false
  static batchOperationInProgress = false
  static fieldTracking = false

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
   * @param callback - The batch operation to execute.
   */
  static batch(callback: () => void) {
    Collection.batchOperationInProgress = true
    Collection.collections.reduce((memo, collection) => () =>
      collection.batch(() => memo()), callback)()
    Collection.batchOperationInProgress = false
  }

  private options: CollectionOptions<T, I, U>
  private persistenceAdapter: PersistenceAdapter<T, I> | null = null
  private isPullingSignal: Signal<boolean>
  private isPushingSignal: Signal<boolean>
  private indexProviders: (IndexProvider<T, I> | LowLevelIndexProvider<T, I>)[] = []
  private indicesOutdated = false
  private idIndex = new Map<string, Set<number>>()
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
   * @param options - Optional configuration for the collection.
   * @param options.memory - The in-memory adapter for storing items.
   * @param options.reactivity - The reactivity adapter for observing changes in the collection.
   * @param options.transform - A transformation function to apply to items when retrieving them.
   * @param options.persistence - The persistence adapter for saving and loading items.
   * @param options.indices - An array of index providers for optimized querying.
   * @param options.enableDebugMode - A boolean to enable or disable debug mode.
   * @param options.fieldTracking - A boolean to enable or disable field tracking by default.
   */
  constructor(options?: CollectionOptions<T, I, U>) {
    super()
    Collection.collections.push(this)
    this.options = {
      memory: [],
      ...options,
    }
    this.fieldTracking = this.options.fieldTracking ?? Collection.fieldTracking
    this.debugMode = this.options.enableDebugMode ?? Collection.debugMode
    this.indexProviders = [
      createExternalIndex('id', this.idIndex),
      ...(this.options.indices || []),
    ]
    this.rebuildIndices()

    this.isPullingSignal = createSignal(this.options.reactivity?.create(), !!options?.persistence)
    this.isPushingSignal = createSignal(this.options.reactivity?.create(), false)
    this.on('persistence.pullStarted', () => {
      this.isPullingSignal.set(true)
    })
    this.on('persistence.pullCompleted', () => {
      this.isPullingSignal.set(false)
    })
    this.on('persistence.pushStarted', () => {
      this.isPushingSignal.set(true)
    })
    this.on('persistence.pushCompleted', () => {
      this.isPushingSignal.set(false)
    })

    this.persistenceAdapter = this.options.persistence ?? null
    if (this.persistenceAdapter) {
      let ongoingSaves = 0
      let isInitialized = false
      const pendingUpdates: Changeset<T> = { added: [], modified: [], removed: [] }

      const loadPersistentData = async (data?: LoadResponse<T>) => {
        if (!this.persistenceAdapter) throw new Error('Persistence adapter not found')
        this.emit('persistence.pullStarted')
        // load items from persistence adapter and push them into memory
        const { items, changes } = data ?? await this.persistenceAdapter.load()

        if (items) {
          // as we overwrite all items, we need to discard if there are ongoing saves
          if (ongoingSaves > 0) return

          // push new items to this.memory() and delete old ones
          this.memory().splice(0, this.memoryArray().length, ...items)
          this.idIndex.clear()
          // eslint-disable-next-line array-callback-return
          this.memory().map((item, index) => {
            this.idIndex.set(serializeValue(item.id), new Set([index]))
          })
        } else if (changes) {
          changes.added.forEach((item) => {
            const index = this.memory().findIndex(doc => doc.id === item.id)
            if (index >= 0) { // item already exists; doing upsert
              this.memory().splice(index, 1, item)
              return
            }

            // item does not exists yet; normal insert
            this.memory().push(item)
            const itemIndex = this.memory().findIndex(doc => doc === item)
            this.idIndex.set(serializeValue(item.id), new Set([itemIndex]))
          })
          changes.modified.forEach((item) => {
            const index = this.memory().findIndex(doc => doc.id === item.id)
            if (index === -1) throw new Error('Cannot resolve index for item')
            this.memory().splice(index, 1, item)
          })
          changes.removed.forEach((item) => {
            const index = this.memory().findIndex(doc => doc.id === item.id)
            if (index === -1) throw new Error('Cannot resolve index for item')
            this.memory().splice(index, 1)
          })
        }
        this.rebuildIndices()

        this.emit('persistence.received')

        // emit persistence.pullCompleted in next tick to let cursor observers
        // do the requery before the loading state updates
        setTimeout(() => this.emit('persistence.pullCompleted'), 0)
      }

      const saveQueue = {
        added: [],
        modified: [],
        removed: [],
      } as Changeset<T>
      let isFlushing = false
      const flushQueue = () => {
        if (!this.persistenceAdapter) throw new Error('Persistence adapter not found')
        if (ongoingSaves <= 0) this.emit('persistence.pushStarted')
        if (isFlushing) return
        if (!hasPendingUpdates(saveQueue)) return
        isFlushing = true
        ongoingSaves += 1
        const currentItems = this.memoryArray()
        const changes = { ...saveQueue }
        saveQueue.added = []
        saveQueue.modified = []
        saveQueue.removed = []
        this.persistenceAdapter.save(currentItems, changes)
          .then(() => {
            this.emit('persistence.transmitted')
          }).catch((error) => {
            this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
          }).finally(() => {
            ongoingSaves -= 1
            isFlushing = false
            flushQueue()
            if (ongoingSaves <= 0) this.emit('persistence.pushCompleted')
          })
      }

      this.on('added', (item) => {
        if (!isInitialized) {
          pendingUpdates.added.push(item)
          return
        }
        saveQueue.added.push(item)
        flushQueue()
      })
      this.on('changed', (item) => {
        if (!isInitialized) {
          pendingUpdates.modified.push(item)
          return
        }
        saveQueue.modified.push(item)
        flushQueue()
      })
      this.on('removed', (item) => {
        if (!isInitialized) {
          pendingUpdates.removed.push(item)
          return
        }
        saveQueue.removed.push(item)
        flushQueue()
      })

      this.persistenceAdapter.register(data => loadPersistentData(data))
        .then(async () => {
          if (!this.persistenceAdapter) throw new Error('Persistence adapter not found')
          let currentItems = this.memoryArray()
          await loadPersistentData()
          while (hasPendingUpdates(pendingUpdates)) {
            const added = pendingUpdates.added.splice(0)
            const modified = pendingUpdates.modified.splice(0)
            const removed = pendingUpdates.removed.splice(0)
            currentItems = applyUpdates(this.memoryArray(), { added, modified, removed })
            // eslint-disable-next-line no-await-in-loop
            await this.persistenceAdapter.save(currentItems, { added, modified, removed })
              .then(() => {
                this.emit('persistence.transmitted')
              })
          }
          await loadPersistentData()

          isInitialized = true
          // emit persistence.init in next tick to make
          // data available before the loading state updates
          setTimeout(() => this.emit('persistence.init'), 0)
        })
        .catch((error) => {
          this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
        })
    }
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

  private profile<ReturnValue>(
    fn: () => ReturnValue,
    measureFunction: (measuredTime: number) => void,
  ) {
    if (!this.debugMode) return fn()
    const startTime = performance.now()
    const result = fn()
    const endTime = performance.now()
    measureFunction(endTime - startTime)
    return result
  }

  private executeInDebugMode(fn: (callstack: string) => void) {
    if (!this.debugMode) return
    const callstack = new Error().stack || ''
    fn(callstack)
  }

  private rebuildIndices() {
    this.indicesOutdated = true
    if (this.batchOperationInProgress) return
    this.rebuildAllIndices()
  }

  private rebuildAllIndices() {
    this.idIndex.clear()
    // eslint-disable-next-line array-callback-return
    this.memory().map((item, index) => {
      this.idIndex.set(serializeValue(item.id), new Set([index]))
    })
    this.indexProviders.forEach(index => index.rebuild(this.memoryArray()))
    this.indicesOutdated = false
  }

  private getIndexInfo(selector?: Selector<T>) {
    if (selector != null
      && Object.keys(selector).length === 1
      && 'id' in selector
      && typeof selector.id !== 'object') {
      return {
        matched: true,
        positions: Array.from(this.idIndex.get(serializeValue(selector.id)) || []),
        optimizedSelector: {},
      }
    }

    if (selector == null || this.indicesOutdated) {
      return {
        matched: false,
        positions: [],
        optimizedSelector: {},
      }
    }

    return getIndexInfo(this.indexProviders, selector)
  }

  private getItemAndIndex(selector: Selector<T>) {
    const memory = this.memoryArray()
    const indexInfo = this.getIndexInfo(selector)
    const items = indexInfo.matched
      ? indexInfo.positions.map(index => memory[index])
      : memory
    const item = items.find(doc => match(doc, selector))
    const index = (indexInfo.matched
      && indexInfo.positions.find(itemIndex => memory[itemIndex] === item))
        || memory.findIndex(doc => doc === item)
    if (item == null) return { item: null, index: -1 }
    if (index === -1) throw new Error('Cannot resolve index for item')
    return { item, index }
  }

  private deleteFromIdIndex(id: I, index: number) {
    this.idIndex.delete(serializeValue(id))

    // offset all indices after the deleted item -1, but only during batch operations
    if (!this.batchOperationInProgress) return
    this.idIndex.forEach(([currenIndex], key) => {
      if (currenIndex > index) {
        this.idIndex.set(key, new Set([currenIndex - 1]))
      }
    })
  }

  private memory() {
    return this.options.memory as NonNullable<MemoryAdapter<T>>
  }

  private memoryArray() {
    return this.memory().map(item => item)
  }

  private transform(item: T): U {
    if (!this.options.transform) return item as unknown as U
    return this.options.transform(item)
  }

  private getItems(selector?: Selector<T>) {
    return this.profile(
      () => {
        const indexInfo = this.getIndexInfo(selector)
        const matchItems = (item: T) => {
          if (indexInfo.optimizedSelector == null) return true // if no selector is given, return all items
          if (Object.keys(indexInfo.optimizedSelector).length <= 0) return true // if selector is empty, return all items
          const matches = match(item, indexInfo.optimizedSelector)
          return matches
        }

        // no index available, use complete memory
        if (!indexInfo.matched) return this.memory().filter(matchItems)

        const memory = this.memoryArray()
        const items = indexInfo.positions.map(index => memory[index])
        this.emit('getItems', selector)
        return items.filter(matchItems)
      },
      measuredTime => this.executeInDebugMode(callstack => this.emit('_debug.getItems', callstack, selector, measuredTime)),
    )
  }

  /**
   * Disposes the collection, unregisters persistence adapters, clears memory, and
   * cleans up all resources used by the collection.
   * @returns A promise that resolves when the collection is disposed.
   */
  public async dispose() {
    if (this.persistenceAdapter?.unregister) await this.persistenceAdapter.unregister()
    this.persistenceAdapter = null
    this.memory().map(() => this.memory().pop())
    this.idIndex.clear()
    this.indexProviders = []
    this.isDisposed = true
  }

  /**
   * Finds multiple items in the collection based on a selector and optional options.
   * Returns a cursor for reactive data queries.
   * @template O - The options type for the find operation.
   * @param [selector] - The criteria to select items.
   * @param [options] - Options for the find operation, such as limit and sort.
   * @returns A cursor to fetch and observe the matching items.
   */
  public find<O extends FindOptions<T>>(selector?: Selector<T>, options?: O) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (selector !== undefined && (!selector || typeof selector !== 'object')) throw new Error('Invalid selector')
    const cursor = new Cursor<T, U>(() => this.getItems(selector), {
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

        this.addListener('persistence.received', handleRequery)
        this.addListener('added', handleRequery)
        this.addListener('changed', handleRequery)
        this.addListener('removed', handleRequery)
        this.emit('observer.created', selector, options)
        return () => {
          this.removeListener('persistence.received', handleRequery)
          this.removeListener('added', handleRequery)
          this.removeListener('changed', handleRequery)
          this.removeListener('removed', handleRequery)
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
   * @template O - The options type for the find operation.
   * @param selector - The criteria to select the item.
   * @param [options] - Options for the find operation, such as projection.
   * @returns The found item or `undefined`.
   */
  public findOne<O extends Omit<FindOptions<T>, 'limit'>>(selector: Selector<T>, options?: O) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    const cursor = this.find(selector, {
      limit: 1,
      ...options,
    })
    const returnValue = cursor.fetch()[0] || undefined
    this.emit('findOne', selector, options, returnValue)
    this.executeInDebugMode(callstack => this.emit('_debug.findOne', callstack, selector, options, returnValue))
    return returnValue
  }

  /**
   * Performs a batch operation, deferring index rebuilds and allowing multiple
   * modifications to be made atomically. Executes any post-batch callbacks afterwards.
   * @param callback - The batch operation to execute.
   */
  public batch(callback: () => void) {
    this.batchOperationInProgress = true
    callback()
    this.batchOperationInProgress = false

    // rebuild indiices as they are not rebuilt during batch operations
    this.rebuildAllIndices()

    // execute all post batch callbacks
    this.postBatchCallbacks.forEach(cb => cb())
    this.postBatchCallbacks.clear()
  }

  /**
   * Inserts a single item into the collection. Generates a unique ID if not provided.
   * @param item - The item to insert.
   * @returns The ID of the inserted item.
   * @throws {Error} If the collection is disposed or the item has an invalid ID.
   */
  public insert(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!item) throw new Error('Invalid item')
    const newItem = { id: randomId(), ...item } as T
    if (this.idIndex.has(serializeValue(newItem.id))) throw new Error('Item with same id already exists')
    this.memory().push(newItem)
    const itemIndex = this.memory().findIndex(doc => doc === newItem)
    this.idIndex.set(serializeValue(newItem.id), new Set([itemIndex]))
    this.rebuildIndices()
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
  public insertMany(items: Array<Omit<T, 'id'> & Partial<Pick<T, 'id'>>>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!items) throw new Error('Invalid items')
    if (items.length === 0) {
      return []
    }

    const ids: I[] = []
    this.batch(() => {
      items.forEach((item) => {
        ids.push(this.insert(item))
      })
    })
    return ids
  }

  /**
   * Updates a single item in the collection that matches the given selector.
   * @param selector - The criteria to select the item to update.
   * @param modifier - The modifications to apply to the item.
   * @returns The number of items updated (0 or 1).
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public updateOne(selector: Selector<T>, modifier: Modifier<T>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')
    if (!modifier) throw new Error('Invalid modifier')

    const { item, index } = this.getItemAndIndex(selector)
    if (item == null) return 0
    const modifiedItem = modify(deepClone(item), modifier)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const existingItem = this.findOne({ id: modifiedItem.id } as any, { reactive: false })
    if (!isEqual(existingItem, { ...existingItem, id: modifiedItem.id })) throw new Error('Item with same id already exists')
    this.memory().splice(index, 1, modifiedItem)
    this.rebuildIndices()
    this.emit('changed', modifiedItem, modifier)
    this.emit('updateOne', selector, modifier)
    this.executeInDebugMode(callstack => this.emit('_debug.updateOne', callstack, selector, modifier))
    return 1
  }

  /**
   * Updates multiple items in the collection that match the given selector.
   * @param selector - The criteria to select the items to update.
   * @param modifier - The modifications to apply to the items.
   * @returns The number of items updated.
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public updateMany(selector: Selector<T>, modifier: Modifier<T>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')
    if (!modifier) throw new Error('Invalid modifier')

    const items = this.getItems(selector)
    const modifiedItems: T[] = []
    items.forEach((item) => {
      const { index } = this.getItemAndIndex({ id: item.id } as Selector<T>)
      if (index === -1) throw new Error('Cannot resolve index for item')
      const modifiedItem = modify(deepClone(item), modifier)
      this.memory().splice(index, 1, modifiedItem)
      modifiedItems.push(modifiedItem)
    })
    this.rebuildIndices()
    modifiedItems.forEach((modifiedItem) => {
      this.emit('changed', modifiedItem, modifier)
    })
    this.emit('updateMany', selector, modifier)
    this.executeInDebugMode(callstack => this.emit('_debug.updateMany', callstack, selector, modifier))
    return modifiedItems.length
  }

  /**
   * Removes a single item from the collection that matches the given selector.
   * @param selector - The criteria to select the item to remove.
   * @returns The number of items removed (0 or 1).
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public removeOne(selector: Selector<T>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')
    const { item, index } = this.getItemAndIndex(selector)
    if (item != null) {
      this.memory().splice(index, 1)
      this.deleteFromIdIndex(item.id, index)
      this.rebuildIndices()
      this.emit('removed', item)
    }
    this.emit('removeOne', selector)
    this.executeInDebugMode(callstack => this.emit('_debug.removeOne', callstack, selector))
    return item == null ? 0 : 1
  }

  /**
   * Removes multiple items from the collection that match the given selector.
   * @param selector - The criteria to select the items to remove.
   * @returns The number of items removed.
   * @throws {Error} If the collection is disposed or invalid arguments are provided.
   */
  public removeMany(selector: Selector<T>) {
    if (this.isDisposed) throw new Error('Collection is disposed')
    if (!selector) throw new Error('Invalid selector')
    const items = this.getItems(selector)

    items.forEach((item) => {
      const index = this.memory().findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      this.memory().splice(index, 1)
      this.deleteFromIdIndex(item.id, index)
      this.rebuildIndices()
    })

    items.forEach((item) => {
      this.emit('removed', item)
    })
    this.emit('removeMany', selector)
    this.executeInDebugMode(callstack => this.emit('_debug.removeMany', callstack, selector))
    return items.length
  }
}