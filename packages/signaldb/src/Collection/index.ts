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

function hasPendingUpdates<T>(pendingUpdates: Changeset<T>) {
  return pendingUpdates.added.length > 0
    || pendingUpdates.modified.length > 0
    || pendingUpdates.removed.length > 0
}
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

// eslint-disable-next-line max-len
export default class Collection<T extends BaseItem<I> = BaseItem, I = any, U = T> extends EventEmitter<CollectionEvents<T, U>> {
  static collections: Collection<any, any>[] = []
  static debugMode = false
  static batchOperationInProgress = false
  static enableDebugMode = () => {
    Collection.debugMode = true
    Collection.collections.forEach((collection) => {
      collection.setDebugMode(true)
    })
  }

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

  constructor(options?: CollectionOptions<T, I, U>) {
    super()
    Collection.collections.push(this)
    this.options = { memory: [], ...options }
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
            currentItems = applyUpdates(currentItems, { added, modified, removed })
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

  public isPulling() {
    return this.isPullingSignal.get() ?? false
  }

  public isPushing() {
    return this.isPushingSignal.get() ?? false
  }

  public isLoading() {
    const isPulling = this.isPulling()
    const isPushing = this.isPushing()
    return isPulling || isPushing
  }

  public getDebugMode() {
    return this.debugMode
  }

  public setDebugMode(enable: boolean) {
    this.debugMode = enable
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

  private getItemAndIndex(selector: Selector<T>) {
    const indexInfo = this.indicesOutdated
      ? { matched: false, positions: [], optimizedSelector: selector }
      : getIndexInfo(this.indexProviders, selector)
    const items = indexInfo.matched
      ? indexInfo.positions.map(index => this.memoryArray()[index])
      : this.memory()
    const item = items.find(doc => match(doc, selector))
    const index = (indexInfo.matched
      && indexInfo.positions.find(itemIndex => this.memoryArray()[itemIndex] === item))
        || this.memory().findIndex(doc => doc === item)
    if (item == null) return { item: null, index: -1 }
    if (index === -1) throw new Error('Cannot resolve index for item')
    return { item, index }
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
        const indexInfo = selector && !this.indicesOutdated
          ? getIndexInfo(this.indexProviders, selector)
          : { matched: false, positions: [], optimizedSelector: selector }
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

  public find<O extends FindOptions<T>>(selector?: Selector<T>, options?: O) {
    if (selector !== undefined && (!selector || typeof selector !== 'object')) throw new Error('Invalid selector')
    const cursor = new Cursor<T, U>(() => this.getItems(selector), {
      reactive: this.options.reactivity,
      ...options,
      transform: this.transform.bind(this),
      bindEvents: (requery) => {
        this.addListener('persistence.received', requery)
        this.addListener('added', requery)
        this.addListener('changed', requery)
        this.addListener('removed', requery)
        this.emit('observer.created', selector, options)
        return () => {
          this.removeListener('persistence.received', requery)
          this.removeListener('added', requery)
          this.removeListener('changed', requery)
          this.removeListener('removed', requery)
          this.emit('observer.disposed', selector, options)
        }
      },
    })
    this.emit('find', selector, options, cursor)
    this.executeInDebugMode(callstack => this.emit('_debug.find', callstack, selector, options, cursor))
    return cursor
  }

  public findOne<O extends Omit<FindOptions<T>, 'limit'>>(selector: Selector<T>, options?: O) {
    const cursor = this.find(selector, {
      limit: 1,
      ...options,
    })
    const returnValue = cursor.fetch()[0] || undefined
    this.emit('findOne', selector, options, returnValue)
    this.executeInDebugMode(callstack => this.emit('_debug.findOne', callstack, selector, options, returnValue))
    return returnValue
  }

  public batch(callback: () => void) {
    this.batchOperationInProgress = true
    callback()
    this.batchOperationInProgress = false

    // do stuff that wasn't executed during the batch operation
    this.rebuildAllIndices()
  }

  public insert(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) {
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

  public updateOne(selector: Selector<T>, modifier: Modifier<T>) {
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

  public updateMany(selector: Selector<T>, modifier: Modifier<T>) {
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

  public removeOne(selector: Selector<T>) {
    if (!selector) throw new Error('Invalid selector')
    const { item, index } = this.getItemAndIndex(selector)
    if (item != null) {
      this.memory().splice(index, 1)
      this.idIndex.delete(serializeValue(item.id))
      this.rebuildIndices()
      this.emit('removed', item)
    }
    this.emit('removeOne', selector)
    this.executeInDebugMode(callstack => this.emit('_debug.removeOne', callstack, selector))
    return item == null ? 0 : 1
  }

  public removeMany(selector: Selector<T>) {
    if (!selector) throw new Error('Invalid selector')
    const items = this.getItems(selector)

    items.forEach((item) => {
      const index = this.memory().findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      this.memory().splice(index, 1)
      this.idIndex.delete(serializeValue(item.id))
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
