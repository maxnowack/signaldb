import type { BaseItem } from './Collection'
import type Collection from './Collection'
import { createExternalIndex } from './Collection/createIndex'
import getIndexInfo from './Collection/getIndexInfo'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type { LowLevelIndexProvider } from './types/IndexProvider'
import type IndexProvider from './types/IndexProvider'
import type Modifier from './types/Modifier'
import type PersistenceAdapter from './types/PersistenceAdapter'
import type { Changeset, LoadResponse } from './types/PersistenceAdapter'
import type Selector from './types/Selector'
import deepClone from './utils/deepClone'
import EventEmitter from './utils/EventEmitter'
import isEqual from './utils/isEqual'
import match from './utils/match'
import modify from './utils/modify'
import project from './utils/project'
import randomId from './utils/randomId'
import serializeValue from './utils/serializeValue'
import sortItems from './utils/sortItems'

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
  const items = [...currentItems]
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

interface DefaultDataAdapterOptions {
  storage?: (name: string) => PersistenceAdapter<any, any>,
  primaryKeyGenerator?: <T extends BaseItem<I>, I>(item: Omit<T, 'id'>) => I,
}

export default class DefaultDataAdapter implements DataAdapter {
  private items: Record<string, BaseItem[]> = {}
  private options: DefaultDataAdapterOptions
  private persistenceAdapters: Record<string, PersistenceAdapter<any, any>> = {}

  private indicesOutdated: Record<string, boolean> = {}
  private idIndices: Record<string, Map<string | undefined | null, Set<number>>> = {}
  private indices: Record<
    string,
    (IndexProvider<any, any> | LowLevelIndexProvider<any, any>)[]
  > = {}

  private activeQueries: Record<string, Set<{
    selector: Selector<any>,
    options?: QueryOptions<any>,
  }>> = {}

  private queryEmitters: Record<
    string,
    EventEmitter<{
      change: (selector: Selector<any>, options: QueryOptions<any> | undefined, state: 'active' | 'complete' | 'error') => void,
    }>
  > = {}

  private queuedQueryUpdates: Record<string, Changeset<any>> = {}
  private cachedQueryResults: Record<string, Map<{
    selector: Selector<any>,
    options?: QueryOptions<any>,
  }, BaseItem[]>> = {}

  constructor(options?: DefaultDataAdapterOptions) {
    this.options = options || {}
  }

  private ensurePersistenceAdapter(name: string) {
    if (this.persistenceAdapters[name]) return // already created
    if (!this.options.storage) return // no storage function provided
    const adapter = this.options.storage(name)
    if (!adapter) return // no adapter returned
    this.persistenceAdapters[name] = adapter
  }

  private rebuildIndicesNow<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
  ) {
    this.idIndices[collection.name].clear()
    this.items[collection.name].forEach((item, index) => {
      this.idIndices[collection.name].set(serializeValue(item.id), new Set([index]))
    })
    this.indices[collection.name].forEach(index => index.rebuild(this.items[collection.name]))
    this.indicesOutdated[collection.name] = false
  }

  private rebuildIndicesIfOutdated<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
  ) {
    this.indicesOutdated[collection.name] = true
    if (collection.isBatchOperationInProgress()) return
    this.rebuildIndicesNow(collection)
  }

  private setupPersistenceAdapter<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
  ) {
    if (!this.persistenceAdapters[collection.name]) return // no persistence adapter available

    let ongoingSaves = 0
    let isInitialized = false
    const pendingUpdates: Changeset<T> = { added: [], modified: [], removed: [] }

    const loadPersistentData = async (data?: LoadResponse<T>) => {
      if (!this.persistenceAdapters[collection.name]) throw new Error('Persistence adapter not found')
      collection.emit('persistence.pullStarted')
      // load items from persistence adapter and push them into memory
      const { items, changes } = data
        ?? await (this.persistenceAdapters[collection.name] as PersistenceAdapter<T, I>).load()

      if (items) {
        // as we overwrite all items, we need to discard if there are ongoing saves
        if (ongoingSaves > 0) return

        // push new items to this.memory() and delete old ones
        this.items[collection.name] = items
        this.indicesOutdated[collection.name] = true
        this.rebuildIndicesIfOutdated(collection)
      } else if (changes) {
        await collection.batch(async () => {
          changes.added.forEach((item) => {
            const index = this.items[collection.name].findIndex(document => document.id === item.id)
            if (index !== -1) { // item already exists; doing upsert
              this.items[collection.name].splice(index, 1, item)
              return
            }

            // item does not exists yet; normal insert
            this.items[collection.name].push(item)
            const itemIndex = this.items[collection.name].findIndex(document => document === item)
            this.idIndices[collection.name].set(serializeValue(item.id), new Set([itemIndex]))
            this.indicesOutdated[collection.name] = true
          })
          changes.modified.forEach((item) => {
            const index = this.items[collection.name].findIndex(document => document.id === item.id)
            if (index === -1) throw new Error('Cannot resolve index for item')
            this.items[collection.name].splice(index, 1, item)
            this.indicesOutdated[collection.name] = true
          })
          changes.removed.forEach((item) => {
            const index = this.items[collection.name].findIndex(document => document.id === item.id)
            if (index === -1) throw new Error('Cannot resolve index for item')
            this.items[collection.name].splice(index, 1)
            this.idIndices[collection.name].delete(serializeValue(item.id))
            this.indicesOutdated[collection.name] = true
          })
        })
      }
      this.rebuildIndicesIfOutdated(collection)

      collection.emit('persistence.received')

      // emit persistence.pullCompleted in next tick to let cursor observers
      // do the requery before the loading state updates
      setTimeout(() => collection.emit('persistence.pullCompleted'), 0)
    }

    const saveQueue = {
      added: [],
      modified: [],
      removed: [],
    } as Changeset<T>
    let isFlushing = false
    const flushQueue = () => {
      if (!this.persistenceAdapters[collection.name]) throw new Error('Persistence adapter not found')
      if (ongoingSaves <= 0) collection.emit('persistence.pushStarted')
      if (isFlushing) return
      if (!hasPendingUpdates(saveQueue)) return
      isFlushing = true
      ongoingSaves += 1
      const currentItems = this.items[collection.name]
      const changes = { ...saveQueue }
      saveQueue.added = []
      saveQueue.modified = []
      saveQueue.removed = []
      this.persistenceAdapters[collection.name].save(currentItems, changes)
        .then(() => {
          collection.emit('persistence.transmitted')
        }).catch((error) => {
          collection.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
        }).finally(() => {
          ongoingSaves -= 1
          isFlushing = false
          flushQueue()
          if (ongoingSaves <= 0) collection.emit('persistence.pushCompleted')
        })
    }

    collection.on('added', (item) => {
      if (!isInitialized) {
        pendingUpdates.added.push(item)
        return
      }
      saveQueue.added.push(item)
      flushQueue()
    })
    collection.on('changed', (item) => {
      if (!isInitialized) {
        pendingUpdates.modified.push(item)
        return
      }
      saveQueue.modified.push(item)
      flushQueue()
    })
    collection.on('removed', (item) => {
      if (!isInitialized) {
        pendingUpdates.removed.push(item)
        return
      }
      saveQueue.removed.push(item)
      flushQueue()
    })

    this.persistenceAdapters[collection.name].register(data => loadPersistentData(data))
      .then(async () => {
        if (!this.persistenceAdapters[collection.name]) throw new Error('Persistence adapter not found')
        let currentItems = this.items[collection.name]
        await loadPersistentData()
        while (hasPendingUpdates(pendingUpdates)) {
          const added = pendingUpdates.added.splice(0)
          const modified = pendingUpdates.modified.splice(0)
          const removed = pendingUpdates.removed.splice(0)
          currentItems = applyUpdates(this.items[collection.name], { added, modified, removed })

          await this.persistenceAdapters[collection.name].save(
            currentItems,
            { added, modified, removed },
          ).then(() => {
            collection.emit('persistence.transmitted')
          })
        }
        await loadPersistentData()

        isInitialized = true
        // emit persistence.init in next tick to make
        // data available before the loading state updates
        setTimeout(() => collection.emit('persistence.init'), 0)
      })
      .catch((error) => {
        collection.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
      })
  }

  private getIndexInfo<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    selector?: Selector<T>,
  ) {
    if (selector != null
      && Object.keys(selector).length === 1
      && 'id' in selector
      && typeof selector.id !== 'object') {
      return {
        matched: true,
        positions: [...this.idIndices[collection.name].get(serializeValue(selector.id)) || []],
        optimizedSelector: {},
      }
    }

    if (selector == null) {
      return {
        matched: false,
        positions: [],
        optimizedSelector: {},
      }
    }

    if (this.indicesOutdated) {
      return {
        matched: false,
        positions: [],
        optimizedSelector: selector,
      }
    }

    return getIndexInfo(this.indices[collection.name], selector)
  }

  private getItemAndIndex<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    selector: Selector<T>,
  ) {
    const memory = this.items[collection.name]
    const indexInfo = this.getIndexInfo(collection, selector)
    const items = indexInfo.matched
      ? indexInfo.positions.map(index => memory[index])
      : memory
    const item = items.find(document => match(document, selector)) as T
    const foundInIndex = indexInfo.matched
      && indexInfo.positions.find(itemIndex => memory[itemIndex] === item)
    const index = foundInIndex
      || memory.findIndex(document => document === item)
    if (item == null) return { item: null, index: -1 }
    if (index === -1) throw new Error('Cannot resolve index for item')
    return { item, index }
  }

  private deleteFromIdIndex<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    id: I,
    index: number,
  ) {
    this.idIndices[collection.name].delete(serializeValue(id))

    // offset all indices after the deleted item -1, but only during batch operations
    if (!collection.isBatchOperationInProgress()) return
    this.idIndices[collection.name].forEach(([currenIndex], key) => {
      if (currenIndex > index) {
        this.idIndices[collection.name].set(key, new Set([currenIndex - 1]))
      }
    })
  }

  private queryItems<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    selector: Selector<T>,
  ) {
    const indexInfo = this.getIndexInfo(collection, selector)
    const matchItems = (item: T) => {
      if (indexInfo.optimizedSelector == null) return true // if no selector is given, return all items
      if (Object.keys(indexInfo.optimizedSelector).length <= 0) return true // if selector is empty, return all items
      const matches = match(item, indexInfo.optimizedSelector)
      return matches
    }

    const items = this.items[collection.name] as T[]

    // no index available, use complete memory
    if (!indexInfo.matched) {
      if (isEqual(selector, {})) return items
      return items.filter(matchItems)
    }

    const foundItems = indexInfo.positions.map(index => items[index])
    if (isEqual(indexInfo.optimizedSelector, {})) return foundItems
    return foundItems.filter(matchItems)
  }

  private executeQuery<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    selector: Selector<T>,
    options?: QueryOptions<T>,
  ): T[] {
    const items = this.queryItems(collection, selector || {})
    const { sort, skip, limit, fields } = options || {}
    const sorted = sort ? sortItems(items, sort) : items
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped
    const idExcluded = fields && fields.id === 0
    return limited.map((item) => {
      if (!fields) return item
      return {
        ...idExcluded ? {} : { id: item.id },
        ...project(item, fields),
      }
    })
  }

  private flushQueuedQueryUpdates<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
  ) {
    if (!this.queuedQueryUpdates[collection.name]) return
    const changes = this.queuedQueryUpdates[collection.name]
    if (!hasPendingUpdates(changes)) return
    this.queuedQueryUpdates[collection.name] = { added: [], modified: [], removed: [] }

    const flatItems = [...changes.added, ...changes.modified, ...changes.removed]
    const queries = this.activeQueries[collection.name]
      .values()
      .filter(({ selector }) => {
        return flatItems.some(item => match(item, selector))
      })
    queries.forEach(({ selector, options }) => {
      const emitter = this.queryEmitters[collection.name]
      emitter.emit('change', selector, options, 'complete')
    })
  }

  private updateQueries<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    changes: Changeset<T>,
  ) {
    this.queuedQueryUpdates[collection.name] = this.queuedQueryUpdates[collection.name]
      || { added: [], modified: [], removed: [] }
    this.queuedQueryUpdates[collection.name].added.push(...changes.added)
    this.queuedQueryUpdates[collection.name].modified.push(...changes.modified)
    this.queuedQueryUpdates[collection.name].removed.push(...changes.removed)
    this.flushQueuedQueryUpdates(collection)
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    indices: (IndexProvider<T, I> | LowLevelIndexProvider<T, I>)[] = [],
  ): CollectionBackend<T, I> {
    this.ensurePersistenceAdapter(collection.name)
    this.items[collection.name] = this.items[collection.name] || []
    this.queryEmitters[collection.name] = this.queryEmitters[collection.name]
      || new EventEmitter<{
        change: (selector: Selector<any>, options: QueryOptions<any>, state: 'active' | 'complete' | 'error') => void,
      }>()
    this.activeQueries[collection.name] = this.activeQueries[collection.name]
      || new Set<{
        selector: Selector<T>,
        options?: QueryOptions<T>,
      }>()

    this.idIndices[collection.name] = this.idIndices[collection.name]
      || new Map<string | undefined | null, Set<number>>()
    this.indices[collection.name] = [
      createExternalIndex('id', this.idIndices[collection.name]),
      ...indices,
    ]

    this.rebuildIndicesIfOutdated(collection)

    const persistenceReadyPromise = new Promise<void>((resolve, reject) => {
      if (!this.persistenceAdapters[collection.name]) return resolve()
      collection.once('persistence.init', resolve)
      collection.once('persistence.error', reject)
    })
    this.setupPersistenceAdapter(collection)

    const backend: CollectionBackend<T, I> = {
      // CRUD operations
      insert: async (item) => {
        const primaryKeyGenerator = this.options.primaryKeyGenerator ?? randomId
        const newItem = { id: primaryKeyGenerator(item), ...item } as T
        collection.emit('validate', newItem)

        if (this.idIndices[collection.name].has(serializeValue(newItem.id))) {
          throw new Error('Item with same id already exists')
        }
        this.items[collection.name].push(newItem)
        const itemIndex = this.items[collection.name].findIndex(document => document === newItem)
        this.idIndices[collection.name].set(serializeValue(newItem.id), new Set([itemIndex]))
        this.rebuildIndicesIfOutdated(collection)
        this.updateQueries(collection, {
          added: [],
          modified: [newItem],
          removed: [],
        })
        return newItem
      },
      updateOne: async (selector, modifier, options) => {
        const { $setOnInsert, ...restModifier } = modifier

        const { item, index } = this.getItemAndIndex(collection, selector)
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
            if (newItem.id != null
              && this.getItemAndIndex(collection, { id: newItem.id } as Selector<T>).item != null) {
              throw new Error(`Item with id '${newItem.id as string}' already exists`)
            }
            const hasItemWithSameId = newItem.id != null
              && this.getItemAndIndex(collection, { id: newItem.id } as Selector<T>).item != null
            if (hasItemWithSameId) {
              throw new Error(`Item with id '${newItem.id as string}' already exists`)
            }
            return [await backend.insert(newItem as T)]
          }
          return [] // no item found, and upsert is not enabled
        } else {
          const modifiedItem = modify(deepClone(item), restModifier)
          const hasItemWithSameId = item.id !== modifiedItem.id
            && this.getItemAndIndex(collection, { id: modifiedItem.id } as Selector<T>).item != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
          }
          collection.emit('validate', modifiedItem)
          this.items[collection.name].splice(index, 1, modifiedItem)
          this.rebuildIndicesIfOutdated(collection)
          collection.emit('changed', modifiedItem, restModifier)
          this.updateQueries(collection, {
            added: [],
            modified: [modifiedItem],
            removed: [],
          })
          return [modifiedItem]
        }
      },
      updateMany: async (selector, modifier, options) => {
        const { $setOnInsert, ...restModifier } = modifier
        const items = backend.getQueryResult(selector)
        if (items.length === 0 && options?.upsert) {
          const newItem: Omit<T, 'id'> & Partial<Pick<T, 'id'>> = modify({} as T, {
            ...restModifier,
            $set: {
              ...$setOnInsert,
              ...restModifier.$set,
            },
          })
          const hasItemWithSameId = newItem.id != null
            && this.getItemAndIndex(collection, { id: newItem.id } as Selector<T>).item != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${newItem.id as string}' already exists`)
          }
          await backend.insert(newItem)
        }

        const changes = items.map((item) => {
          const { index } = this.getItemAndIndex(collection, { id: item.id } as Selector<T>)
          if (index === -1) throw new Error(`Cannot resolve index for item with id '${item.id as string}'`)
          const modifiedItem = modify(deepClone(item), restModifier)
          const hasItemWithSameId = item.id !== modifiedItem.id
            && this.getItemAndIndex(collection, { id: modifiedItem.id } as Selector<T>).item != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
          }
          collection.emit('validate', modifiedItem)
          return {
            item: modifiedItem,
            index,
          }
        })
        changes.forEach(({ item, index }) => {
          this.items[collection.name].splice(index, 1, item)
        })
        this.rebuildIndicesIfOutdated(collection)
        const changedItems = changes.map(({ item }) => item)
        this.updateQueries(collection, {
          added: [],
          modified: changedItems,
          removed: [],
        })
        return changedItems
      },
      replaceOne: async (selector, replacement, options) => {
        const { item, index } = this.getItemAndIndex(collection, selector)
        if (item == null) {
          if (options?.upsert) {
            // if upsert is enabled, insert a new item
            const hasItemWithSameId = replacement.id != null && this.getItemAndIndex(
              collection,
              { id: replacement.id } as Selector<T>,
            ).item != null
            if (hasItemWithSameId) {
              throw new Error(`Item with id '${replacement.id as string}' already exists`)
            }
            return [await backend.insert(replacement)]
          }
          return [] // no item found, and upsert is not enabled
        } else {
          const hasItemWithSameId = item.id !== replacement.id
            && this.getItemAndIndex(collection, { id: replacement.id } as Selector<T>).item != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${replacement.id as string}' already exists`)
          }
          const modifiedItem = { id: item.id, ...replacement } as T
          collection.emit('validate', modifiedItem)
          this.items[collection.name].splice(index, 1, modifiedItem)
          this.rebuildIndicesIfOutdated(collection)
          collection.emit('changed', modifiedItem, replacement as Modifier<T>)

          this.updateQueries(collection, {
            added: [],
            modified: [modifiedItem],
            removed: [],
          })
          return [modifiedItem]
        }
      },
      removeOne: async (selector) => {
        const { item, index } = this.getItemAndIndex(collection, selector)
        if (item != null) {
          this.items[collection.name].splice(index, 1)
          this.deleteFromIdIndex(collection, item.id, index)
          this.rebuildIndicesIfOutdated(collection)
          collection.emit('removed', item)
        }
        this.updateQueries(collection, {
          added: [],
          modified: [],
          removed: item == null ? [] : [item],
        })
        return item == null ? [] : [item]
      },
      removeMany: async (selector) => {
        const items = backend.getQueryResult(selector)

        items.forEach((item) => {
          const index = this.items[collection.name].findIndex(document => document === item)
          if (index === -1) throw new Error('Cannot resolve index for item')
          this.items[collection.name].splice(index, 1)
          this.deleteFromIdIndex(collection, item.id, index)
          this.rebuildIndicesIfOutdated(collection)
        })

        items.forEach((item) => {
          collection.emit('removed', item)
        })

        this.updateQueries(collection, {
          added: [],
          modified: [],
          removed: items,
        })
        return items
      },

      // methods for registering and unregistering queries that will be called from the collection during find/findOne
      registerQuery: (selector, options) => {
        this.activeQueries[collection.name] = this.activeQueries[collection.name] || new Set()
        this.activeQueries[collection.name].add({ selector, options })
      },
      unregisterQuery: (selector, options) => {
        if (!this.activeQueries[collection.name]) return
        this.activeQueries[collection.name].delete({ selector, options })
      },
      getQueryState: () => 'complete',
      onQueryStateChange: (selector, options, callback) => {
        const emitter = this.queryEmitters[collection.name]
        const handler = (
          querySelector: Selector<any>,
          queryOptions: QueryOptions<any> | undefined,
          state: 'active' | 'complete' | 'error',
        ) => {
          if (querySelector !== selector || queryOptions !== options) return
          callback(state)
        }
        emitter.on('change', handler)
        return () => {
          emitter.off('change', handler)
        }
      },
      getQueryError: () => null,
      getQueryResult: (selector, options) => {
        const result = this.executeQuery(collection, selector, options)
        const isQueryActive = this.activeQueries[collection.name].has({ selector, options })
        if (isQueryActive) {
          this.cachedQueryResults[collection.name] = this.cachedQueryResults[collection.name]
            || new Map()

          this.cachedQueryResults[collection.name].set(
            { selector, options },
            result,
          )
        }
        return result
      },

      // lifecycle methods
      dispose: async () => {
        const adapter = this.persistenceAdapters[collection.name]
        if (adapter?.unregister) await adapter.unregister()
        delete this.persistenceAdapters[collection.name]
        delete this.items[collection.name]
        delete this.indicesOutdated[collection.name]
        delete this.idIndices[collection.name]
        delete this.indices[collection.name]
        delete this.activeQueries[collection.name]
        delete this.queryEmitters[collection.name]
        delete this.queuedQueryUpdates[collection.name]
        delete this.cachedQueryResults[collection.name]
      },
      isReady: () => persistenceReadyPromise,
    }

    return backend
  }
}
