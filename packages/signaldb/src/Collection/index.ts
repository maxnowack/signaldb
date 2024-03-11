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
import type { Changeset } from '../types/PersistenceAdapter'
import executeOncePerTick from '../utils/executeOncePerTick'
import serializeValue from '../utils/serializeValue'
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
}

interface CollectionEvents<T> {
  added: (item: T) => void,
  changed: (item: T) => void,
  removed: (item: T) => void,

  'persistence.init': () => void,
  'persistence.error': (error: Error) => void,
  'persistence.transmitted': () => void,
  'persistence.received': () => void,
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
export default class Collection<T extends BaseItem<I> = BaseItem, I = any, U = T> extends EventEmitter<CollectionEvents<T>> {
  private options: CollectionOptions<T, I, U>
  private persistenceAdapter: PersistenceAdapter<T, I> | null = null
  private indexProviders: (IndexProvider<T, I> | LowLevelIndexProvider<T, I>)[] = []
  private indicesOutdated = false
  private idIndex = new Map<string, Set<number>>()

  constructor(options?: CollectionOptions<T, I, U>) {
    super()
    this.options = { memory: [], ...options }
    this.indexProviders = [
      createExternalIndex('id', this.idIndex),
      ...(this.options.indices || []),
    ]
    if (this.options.persistence) {
      const persistenceAdapter = this.options.persistence
      this.persistenceAdapter = persistenceAdapter

      let ongoingSaves = 0
      let isInitialized = false
      const pendingUpdates: Changeset<T> = { added: [], modified: [], removed: [] }

      const loadPersistentData = async () => {
        // load items from persistence adapter and push them into memory
        const { items, changes } = await persistenceAdapter.load()

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
      }

      const saveQueue = {
        added: [],
        modified: [],
        removed: [],
      } as Changeset<T>
      let isFlushing = false
      const flushQueue = () => {
        if (isFlushing) return
        if (!hasPendingUpdates(saveQueue)) return
        isFlushing = true
        ongoingSaves += 1
        const currentItems = this.memoryArray()
        const changes = { ...saveQueue }
        saveQueue.added = []
        saveQueue.modified = []
        saveQueue.removed = []
        persistenceAdapter.save(currentItems, changes)
          .then(() => {
            this.emit('persistence.transmitted')
          }).catch((error) => {
            this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
          }).finally(() => {
            ongoingSaves -= 1
            isFlushing = false
            flushQueue()
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

      persistenceAdapter.register(() => loadPersistentData())
        .then(async () => {
          let currentItems = this.memoryArray()
          await loadPersistentData()
          while (hasPendingUpdates(pendingUpdates)) {
            const added = pendingUpdates.added.splice(0)
            const modified = pendingUpdates.modified.splice(0)
            const removed = pendingUpdates.removed.splice(0)
            currentItems = applyUpdates(currentItems, { added, modified, removed })
            // eslint-disable-next-line no-await-in-loop
            await persistenceAdapter.save(currentItems, { added, modified, removed })
              .then(() => {
                this.emit('persistence.transmitted')
              })
          }
          await loadPersistentData()

          isInitialized = true
          this.emit('persistence.init')
        })
        .catch((error) => {
          this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
        })
    }
  }

  private rebuildIndices() {
    this.indicesOutdated = true
    this.rebuildIndicesOncePerTick()
  }

  private rebuildIndicesOncePerTick = executeOncePerTick(this.rebuildAllIndices.bind(this))

  private rebuildAllIndices() {
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
    return items.filter(matchItems)
  }

  public find<O extends FindOptions<T>>(selector?: Selector<T>, options?: O) {
    if (selector !== undefined && (!selector || typeof selector !== 'object')) throw new Error('Invalid selector')
    return new Cursor<T, U>(() => this.getItems(selector), {
      reactive: this.options.reactivity,
      ...options,
      transform: this.transform.bind(this),
      bindEvents: (requery) => {
        const requeryOnce = executeOncePerTick(requery, true)
        this.addListener('persistence.received', requeryOnce)
        this.addListener('added', requeryOnce)
        this.addListener('changed', requeryOnce)
        this.addListener('removed', requeryOnce)
        return () => {
          this.removeListener('persistence.received', requeryOnce)
          this.removeListener('added', requeryOnce)
          this.removeListener('changed', requeryOnce)
          this.removeListener('removed', requeryOnce)
        }
      },
    })
  }

  public findOne<O extends Omit<FindOptions<T>, 'limit'>>(selector: Selector<T>, options?: O) {
    const cursor = this.find(selector, {
      limit: 1,
      ...options,
    })
    return cursor.fetch()[0] || undefined
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
    return newItem.id
  }

  public updateOne(selector: Selector<T>, modifier: Modifier<T>) {
    if (!selector) throw new Error('Invalid selector')
    if (!modifier) throw new Error('Invalid modifier')

    const { item, index } = this.getItemAndIndex(selector)
    if (item == null) return 0
    const modifiedItem = modify({ ...item }, modifier)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const existingItem = this.findOne({ id: modifiedItem.id } as any, { reactive: false })
    if (!isEqual(existingItem, { ...existingItem, id: modifiedItem.id })) throw new Error('Item with same id already exists')
    this.memory().splice(index, 1, modifiedItem)
    this.rebuildIndices()
    this.emit('changed', modifiedItem)
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
      const modifiedItem = modify(item, modifier)
      this.memory().splice(index, 1, modifiedItem)
      modifiedItems.push(modifiedItem)
    })
    this.rebuildIndices()
    modifiedItems.forEach((modifiedItem) => {
      this.emit('changed', modifiedItem)
    })
    return modifiedItems.length
  }

  public removeOne(selector: Selector<T>) {
    if (!selector) throw new Error('Invalid selector')
    const { item, index } = this.getItemAndIndex(selector)
    if (item == null) return 0
    this.memory().splice(index, 1)
    this.rebuildIndices()
    this.emit('removed', item)
    return 1
  }

  public removeMany(selector: Selector<T>) {
    if (!selector) throw new Error('Invalid selector')
    const items = this.getItems(selector)

    items.forEach((item) => {
      const index = this.memory().findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      this.memory().splice(index, 1)
      this.rebuildIndices()
    })

    items.forEach((item) => {
      this.emit('removed', item)
    })
    return items.length
  }
}
