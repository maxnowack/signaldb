import type { BaseItem } from './Collection'
import type Collection from './Collection'
import createIndex, { createExternalIndex } from './Collection/createIndex'
import getIndexInfo from './Collection/getIndexInfo'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type { LowLevelIndexProvider } from './types/IndexProvider'
import type IndexProvider from './types/IndexProvider'
import type StorageAdapter from './types/StorageAdapter'
import type { Changeset, LoadResponse } from './types/StorageAdapter'
import type Selector from './types/Selector'
import deepClone from './utils/deepClone'
import EventEmitter from './utils/EventEmitter'
import isEqual from './utils/isEqual'
import match from './utils/match'
import modify from './utils/modify'
import project from './utils/project'
import queryId from './utils/queryId'
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
  storage?: (name: string) => StorageAdapter<any, any>,
}

export default class DefaultDataAdapter implements DataAdapter {
  private items: Map<string, BaseItem[]> = new Map()
  private options: DefaultDataAdapterOptions
  private storageAdapters: Map<string, StorageAdapter<any, any>> = new Map()

  private indicesOutdated: Map<string, boolean> = new Map()
  private idIndices: Map<string, Map<string | undefined | null, Set<number>>> = new Map()
  private indices: Map<
    string,
    (IndexProvider<any, any> | LowLevelIndexProvider<any, any>)[]
  > = new Map()

  private activeQueries: Map<string, Map<string, {
    selector: Selector<any>,
    options?: QueryOptions<any>,
  }>> = new Map()

  private queryEmitters: Map<
    string,
    EventEmitter<{
      change: (selector: Selector<any>, options: QueryOptions<any> | undefined, state: 'active' | 'complete' | 'error') => void,
    }>
  > = new Map()

  private queuedQueryUpdates: Map<string, Changeset<any>> = new Map()
  private cachedQueryResults: Map<string, Map<string, BaseItem[]>> = new Map()

  constructor(options?: DefaultDataAdapterOptions) {
    this.options = options || {}
  }

  private ensureStorageAdapter(name: string) {
    if (this.storageAdapters.get(name)) return // already created
    if (!this.options.storage) return // no storage function provided
    const adapter = this.options.storage(name)
    if (!adapter) return // no adapter returned
    this.storageAdapters.set(name, adapter)
  }

  private rebuildIndicesNow<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    const idIndices = this.idIndices.get(collection.name)
    if (!idIndices) throw new Error(`ID index not found for collection ${collection.name}`)
    const items = this.items.get(collection.name)
    if (!items) throw new Error(`Items not found for collection ${collection.name}`)
    const indices = this.indices.get(collection.name)
    if (!indices) throw new Error(`Indices not found for collection ${collection.name}`)

    idIndices.clear()
    idIndices.clear()
    items.forEach((item, index) => {
      idIndices.set(serializeValue(item.id), new Set([index]))
    })
    indices.forEach(index => index.rebuild(items))
    this.indicesOutdated.set(collection.name, false)
  }

  private rebuildIndicesIfOutdated<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    const isOutdated = this.indicesOutdated.get(collection.name)
    this.indicesOutdated.set(collection.name, true)
    if (collection.isBatchOperationInProgress()) {
      if (isOutdated) return // if indices are already outdated, rebuilding already scheduled
      collection.onPostBatch(() => this.rebuildIndicesNow(collection))
      return
    }
    this.rebuildIndicesNow(collection)
  }

  private setupStorageAdapter<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    if (!this.storageAdapters.get(collection.name)) return // no persistence adapter available

    // emit event for initial pull
    setTimeout(() => collection.emit('persistence.pullStarted'), 0)

    let ongoingSaves = 0
    let isInitialized = false
    const pendingUpdates: Changeset<T> = { added: [], modified: [], removed: [] }

    const loadPersistentData = async (data?: LoadResponse<T>) => {
      if (!this.storageAdapters.get(collection.name)) throw new Error('Persistence adapter not found')

      // only emit pullStarted if already initialized as the first emit is done during setup
      if (isInitialized) collection.emit('persistence.pullStarted')

      // load items from persistence adapter and push them into memory
      const { items, changes } = data
        ?? await (this.storageAdapters.get(collection.name) as StorageAdapter<T, I>).load()

      if (items) {
        // as we overwrite all items, we need to discard if there are ongoing saves
        if (ongoingSaves > 0) return

        // push new items to this.memory() and delete old ones
        this.items.set(collection.name, [...items])
        this.indicesOutdated.set(collection.name, true)
        this.rebuildIndicesIfOutdated(collection)
      } else if (changes) {
        await collection.batch(async () => {
          changes.added.forEach((item) => {
            const collectionItems = this.items.get(collection.name) ?? []
            const index = collectionItems.findIndex(document => document.id === item.id)
            if (index !== -1) { // item already exists; doing upsert
              collectionItems.splice(index, 1, item)
              this.items.set(collection.name, collectionItems)
              return
            }

            // item does not exists yet; normal insert
            collectionItems.push(item)
            const itemIndex = collectionItems.findIndex(document => document === item)
            this.items.set(collection.name, collectionItems)
            this.idIndices.get(collection.name)?.set(serializeValue(item.id), new Set([itemIndex]))
            this.indicesOutdated.set(collection.name, true)
          })
          changes.modified.forEach((item) => {
            const collectionItems = this.items.get(collection.name) ?? []
            const index = collectionItems.findIndex(document => document.id === item.id)
            if (index === -1) throw new Error('Cannot resolve index for item')
            collectionItems.splice(index, 1, item)
            this.items.set(collection.name, collectionItems)
            this.indicesOutdated.set(collection.name, true)
          })
          changes.removed.forEach((item) => {
            const collectionItems = this.items.get(collection.name) ?? []
            const index = collectionItems.findIndex(document => document.id === item.id)
            if (index === -1) throw new Error('Cannot resolve index for item')
            collectionItems.splice(index, 1)
            this.items.set(collection.name, collectionItems)
            this.idIndices.get(collection.name)?.delete(serializeValue(item.id))
            this.indicesOutdated.set(collection.name, true)
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
      if (!this.storageAdapters.get(collection.name)) throw new Error('Persistence adapter not found')
      if (ongoingSaves <= 0) collection.emit('persistence.pushStarted')
      if (isFlushing) return
      if (!hasPendingUpdates(saveQueue)) return
      isFlushing = true
      ongoingSaves += 1
      const currentItems = this.items.get(collection.name) ?? []
      const changes = { ...saveQueue }
      saveQueue.added = []
      saveQueue.modified = []
      saveQueue.removed = []
      this.storageAdapters.get(collection.name)?.save(currentItems, changes)
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

    this.storageAdapters.get(collection.name)?.register(data => loadPersistentData(data))
      .then(async () => {
        if (!this.storageAdapters.get(collection.name)) throw new Error('Persistence adapter not found')
        let currentItems = this.items.get(collection.name)
        await loadPersistentData()
        while (hasPendingUpdates(pendingUpdates)) {
          const added = pendingUpdates.added.splice(0)
          const modified = pendingUpdates.modified.splice(0)
          const removed = pendingUpdates.removed.splice(0)
          currentItems = applyUpdates(
            this.items.get(collection.name) ?? [],
            { added, modified, removed },
          )

          await this.storageAdapters.get(collection.name)?.save(
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

  private getIndexInfo<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector?: Selector<T>,
  ) {
    if (selector != null
      && Object.keys(selector).length === 1
      && 'id' in selector
      && typeof selector.id !== 'object') {
      return {
        matched: true,
        positions: [...this.idIndices.get(collection.name)?.get(serializeValue(selector.id)) ?? []],
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

    if (this.indicesOutdated.get(collection.name)) {
      return {
        matched: false,
        positions: [],
        optimizedSelector: selector,
      }
    }

    return getIndexInfo(this.indices.get(collection.name) ?? [], selector)
  }

  private getItemAndIndex<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector: Selector<T>,
  ) {
    const memory = this.items.get(collection.name) ?? []
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

  private deleteFromIdIndex<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    id: I,
    index: number,
  ) {
    this.idIndices.get(collection.name)?.delete(serializeValue(id))

    // offset all indices after the deleted item -1, but only during batch operations
    if (!collection.isBatchOperationInProgress()) return
    this.idIndices.get(collection.name)?.forEach(([currenIndex], key) => {
      if (currenIndex > index) {
        this.idIndices.get(collection.name)?.set(key, new Set([currenIndex - 1]))
      }
    })
  }

  private queryItems<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector: Selector<T>,
  ) {
    const indexInfo = this.getIndexInfo(collection, selector)
    const matchItems = (item: T) => {
      if (indexInfo.optimizedSelector == null) return true // if no selector is given, return all items
      if (Object.keys(indexInfo.optimizedSelector).length <= 0) return true // if selector is empty, return all items
      const matches = match(item, indexInfo.optimizedSelector)
      return matches
    }

    const items = this.items.get(collection.name) as T[]

    // no index available, use complete memory
    if (!indexInfo.matched) {
      if (isEqual(selector, {})) return items
      return items.filter(matchItems)
    }

    const foundItems = indexInfo.positions.map(index => items[index])
    if (isEqual(indexInfo.optimizedSelector, {})) return foundItems
    return foundItems.filter(matchItems)
  }

  private executeQuery<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
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

  private flushQueuedQueryUpdates<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    if (!this.queuedQueryUpdates.get(collection.name)) return
    const changes = this.queuedQueryUpdates.get(collection.name)
    if (!changes || !hasPendingUpdates(changes)) return
    this.queuedQueryUpdates.set(collection.name, { added: [], modified: [], removed: [] })

    const flatItems = [...changes.added, ...changes.modified, ...changes.removed]
    const queries = [...this.activeQueries.get(collection.name)?.values() ?? []]
      .filter(({ selector }) => flatItems.some(item => match(item, selector)))
    queries.forEach(({ selector, options }) => {
      const emitter = this.queryEmitters.get(collection.name)
      if (!emitter) return
      emitter.emit('change', selector, options, 'complete')
    })
  }

  private updateQueries<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    changes: Changeset<T>,
  ) {
    this.queuedQueryUpdates.set(
      collection.name,
      this.queuedQueryUpdates.get(collection.name) || { added: [], modified: [], removed: [] },
    )
    this.queuedQueryUpdates.get(collection.name)?.added.push(...changes.added)
    this.queuedQueryUpdates.get(collection.name)?.modified.push(...changes.modified)
    this.queuedQueryUpdates.get(collection.name)?.removed.push(...changes.removed)
    this.flushQueuedQueryUpdates(collection)
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    indices: string[] = [],
  ): CollectionBackend<T, I> {
    this.ensureStorageAdapter(collection.name)
    this.items.set(collection.name, this.items.get(collection.name) ?? [])
    this.queryEmitters.set(
      collection.name,
      this.queryEmitters.get(collection.name) ?? new EventEmitter<{
        change: (selector: Selector<any>, options: QueryOptions<any> | undefined, state: 'active' | 'complete' | 'error') => void,
      }>(),
    )
    this.activeQueries.set(
      collection.name,
      this.activeQueries.get(collection.name) || new Map<string, {
        selector: Selector<T>,
        options?: QueryOptions<T>,
      }>(),
    )

    this.idIndices.set(
      collection.name,
      this.idIndices.get(collection.name) || new Map<string | undefined | null, Set<number>>(),
    )
    this.indices.set(collection.name, [
      createExternalIndex('id', this.idIndices.get(collection.name) as Map<string | undefined | null, Set<number>>),
      ...indices.map(field => createIndex(field)),
    ])

    this.rebuildIndicesIfOutdated(collection)

    const persistenceReadyPromise = new Promise<void>((resolve, reject) => {
      if (!this.storageAdapters.get(collection.name)) return resolve()
      collection.once('persistence.init', resolve)
      collection.once('persistence.error', reject)
    })
    this.setupStorageAdapter(collection)

    const backend: CollectionBackend<T, I> = {
      // CRUD operations
      insert: async (newItem) => {
        if (this.idIndices.get(collection.name)?.has(serializeValue(newItem.id))) {
          throw new Error(`Item with id '${newItem.id as string}' already exists`)
        }
        this.items.get(collection.name)?.push(newItem)
        const itemIndex = this.items.get(collection.name)
          ?.findIndex(document => document === newItem)
        if (itemIndex != null) {
          this.idIndices.get(collection.name)
            ?.set(serializeValue(newItem.id), new Set([itemIndex]))
        }
        this.rebuildIndicesIfOutdated(collection)
        this.updateQueries(collection, {
          added: [],
          modified: [newItem],
          removed: [],
        })
        return newItem
      },
      updateOne: async (selector, modifier) => {
        const { $setOnInsert, ...restModifier } = modifier

        const { item, index } = this.getItemAndIndex(collection, selector)
        if (item == null) return [] // no item found

        const modifiedItem = modify(deepClone(item), restModifier)
        const hasItemWithSameId = item.id !== modifiedItem.id
          && this.getItemAndIndex(collection, { id: modifiedItem.id } as Selector<T>).item != null
        if (hasItemWithSameId) {
          throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
        }

        this.items.get(collection.name)?.splice(index, 1, modifiedItem)
        this.rebuildIndicesIfOutdated(collection)

        this.updateQueries(collection, {
          added: [],
          modified: [modifiedItem],
          removed: [],
        })
        return [modifiedItem]
      },
      updateMany: async (selector, modifier) => {
        const { $setOnInsert, ...restModifier } = modifier
        const items = backend.getQueryResult(selector)

        const changes = items.map((item) => {
          const { index } = this.getItemAndIndex(collection, { id: item.id } as Selector<T>)
          if (index === -1) throw new Error(`Cannot resolve index for item with id '${item.id as string}'`)
          const modifiedItem = modify(deepClone(item), restModifier)
          const hasItemWithSameId = item.id !== modifiedItem.id
            && this.getItemAndIndex(collection, { id: modifiedItem.id } as Selector<T>).item != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
          }

          return {
            item: modifiedItem,
            index,
          }
        })
        changes.forEach(({ item, index }) => {
          this.items.get(collection.name)?.splice(index, 1, item)
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
      replaceOne: async (selector, replacement) => {
        const { item, index } = this.getItemAndIndex(collection, selector)
        if (item == null) return [] // no item found

        const hasItemWithSameId = item.id !== replacement.id
          && replacement.id != null
          && this.getItemAndIndex(collection, { id: replacement.id } as Selector<T>).item != null
        if (hasItemWithSameId) {
          throw new Error(`Item with id '${replacement.id as string}' already exists`)
        }
        const modifiedItem = { id: item.id, ...replacement } as T

        this.items.get(collection.name)?.splice(index, 1, modifiedItem)
        this.rebuildIndicesIfOutdated(collection)

        this.updateQueries(collection, {
          added: [],
          modified: [modifiedItem],
          removed: [],
        })
        return [modifiedItem]
      },
      removeOne: async (selector) => {
        const { item, index } = this.getItemAndIndex(collection, selector)
        if (item == null) return [] // no item found
        this.items.get(collection.name)?.splice(index, 1)
        this.deleteFromIdIndex(collection, item.id, index)
        this.rebuildIndicesIfOutdated(collection)
        this.updateQueries(collection, {
          added: [],
          modified: [],
          removed: [item],
        })
        return [item]
      },
      removeMany: async (selector) => {
        const items = backend.getQueryResult(selector)

        items.forEach((item) => {
          const index = this.items.get(collection.name)
            ?.findIndex(document => document === item) ?? -1
          if (index === -1) throw new Error(`Cannot resolve index for item with id '${item.id as string}'`)
          this.items.get(collection.name)?.splice(index, 1)
          this.deleteFromIdIndex(collection, item.id, index)
          this.rebuildIndicesIfOutdated(collection)
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
        this.activeQueries.set(
          collection.name,
          this.activeQueries.get(collection.name) || new Map<string, {
            selector: Selector<T>,
            options?: QueryOptions<T>,
          }>(),
        )
        this.activeQueries.get(collection.name)?.set(queryId(selector, options), {
          selector,
          options,
        })
      },
      unregisterQuery: (selector, options) => {
        if (!this.activeQueries.get(collection.name)) return
        this.activeQueries.get(collection.name)?.delete(queryId(selector, options))
      },
      getQueryState: () => 'complete',
      onQueryStateChange: (selector, options, callback) => {
        const emitter = this.queryEmitters.get(collection.name)
        if (!emitter) throw new Error(`Query emitter not found for collection ${collection.name}`)
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
        const isQueryActive = this.activeQueries.get(collection.name)
          ?.has(queryId(selector, options))
        if (isQueryActive) {
          this.cachedQueryResults.set(
            collection.name,
            this.cachedQueryResults.get(collection.name) || new Map<string, BaseItem[]>(),
          )

          this.cachedQueryResults.get(collection.name)?.set(
            queryId(selector, options),
            result,
          )
        }
        return result
      },

      // lifecycle methods
      dispose: async () => {
        const adapter = this.storageAdapters.get(collection.name)
        if (adapter?.unregister) await adapter.unregister()
        this.storageAdapters.delete(collection.name)
        this.items.delete(collection.name)
        this.indicesOutdated.delete(collection.name)
        this.idIndices.delete(collection.name)
        this.indices.delete(collection.name)
        this.activeQueries.delete(collection.name)
        this.queryEmitters.delete(collection.name)
        this.queuedQueryUpdates.delete(collection.name)
        this.cachedQueryResults.delete(collection.name)
      },
      isReady: () => persistenceReadyPromise,
    }

    return backend
  }
}
