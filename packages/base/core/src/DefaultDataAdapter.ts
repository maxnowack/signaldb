import type { BaseItem } from './Collection'
import type Collection from './Collection'
import createIndex from './Collection/createIndex'
import getIndexInfo from './Collection/getIndexInfo'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type { LowLevelIndexProvider } from './types/IndexProvider'
import type IndexProvider from './types/IndexProvider'
import type StorageAdapter from './types/StorageAdapter'
import type { Changeset } from './types/StorageAdapter'
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

interface DefaultDataAdapterOptions {
  storage?: (name: string) => StorageAdapter<any, any> | undefined,
  onError?: (name: string, error: Error) => void,
}

export default class DefaultDataAdapter implements DataAdapter {
  private items: Map<string, Map<string | null, BaseItem>> = new Map()
  private options: DefaultDataAdapterOptions
  private storageAdapters: Map<string, StorageAdapter<any, any>> = new Map()

  private indicesOutdated: Map<string, boolean> = new Map()
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
    const items = this.items.get(collection.name)
    if (!items) throw new Error(`Items not found for collection ${collection.name}`)
    const indices = this.indices.get(collection.name)
    if (!indices) throw new Error(`Indices not found for collection ${collection.name}`)

    indices.forEach(index => index.rebuild([...items.values()]))
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

  private async setupStorageAdapter<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    const storageAdapter = this.storageAdapters.get(collection.name)
    if (!storageAdapter) return // no persistence adapter available

    return storageAdapter.setup()
      .then(async () => {
        const items: T[] = await storageAdapter.readAll()
        this.items.set(collection.name, items.reduce((map, item) => {
          map.set(serializeValue(item.id), item)
          return map
        }, new Map<string | null, T>()))
        this.indicesOutdated.set(collection.name, true)
        this.rebuildIndicesIfOutdated(collection)
      })
      .catch((error) => {
        if (!this.options.onError) {
          // eslint-disable-next-line no-console
          console.error(`Error during data persistence operation in collection ${collection.name}`, error)
          return
        }
        this.options.onError(
          collection.name,
          error instanceof Error ? error : new Error(error as string),
        )
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
        ids: [serializeValue(selector.id)],
        optimizedSelector: {},
      }
    }

    if (selector == null) {
      return {
        matched: false,
        ids: [],
        optimizedSelector: {},
      }
    }

    if (this.indicesOutdated.get(collection.name)) {
      return {
        matched: false,
        ids: [],
        optimizedSelector: selector,
      }
    }

    return getIndexInfo(
      (this.indices.get(collection.name) ?? []).map(i => i.query.bind(i)),
      selector,
    )
  }

  private getItem<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector: Selector<T>,
  ) {
    const memory = this.items.get(collection.name) ?? new Map<string | null, T>()
    const indexInfo = this.getIndexInfo(collection, selector)
    const items = indexInfo.matched
      ? indexInfo.ids.map(id => memory.get(serializeValue(id)) as T).filter(i => i != null)
      : [...memory.values()]
    const item = items.find(document => match(document, selector)) as T
    return item
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

    const items = this.items.get(collection.name) as Map<string | null, T>

    // no index available, use complete memory
    if (!indexInfo.matched) {
      if (isEqual(selector, {})) return [...items.values()]
      return [...items.values()].filter(matchItems)
    }

    const foundItems = indexInfo.ids.map(ids =>
      items.get(serializeValue(ids)) as T).filter(i => i != null)
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
    this.items.set(collection.name, this.items.get(collection.name) ?? new Map<string | null, T>())
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

    this.indices.set(collection.name, indices.map(field => createIndex(field)))

    this.rebuildIndicesIfOutdated(collection)

    const persistenceReadyPromise = this.setupStorageAdapter(collection)

    const backend: CollectionBackend<T, I> = {
      // CRUD operations
      insert: async (newItem) => {
        const items = this.items.get(collection.name)
        if (!items) throw new Error(`Items not found for collection ${collection.name}`)
        if (items.has(serializeValue(newItem.id))) {
          throw new Error(`Item with id '${newItem.id as string}' already exists`)
        }
        this.items.get(collection.name)?.set(serializeValue(newItem.id), newItem)
        await this.storageAdapters.get(collection.name)?.insert([newItem])
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

        const item = this.getItem(collection, selector)
        if (item == null) return [] // no item found

        const modifiedItem = modify(deepClone(item), restModifier)
        const hasItemWithSameId = item.id !== modifiedItem.id
          && this.getItem(collection, { id: modifiedItem.id } as Selector<T>) != null
        if (hasItemWithSameId) {
          throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
        }

        this.items.get(collection.name)?.set(serializeValue(modifiedItem.id), modifiedItem)
        await this.storageAdapters.get(collection.name)?.replace([modifiedItem])
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

        const changedItems = items.map((item) => {
          const modifiedItem = modify(deepClone(item), restModifier)
          const hasItemWithSameId = item.id !== modifiedItem.id
            && this.getItem(collection, { id: modifiedItem.id } as Selector<T>) != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
          }

          return modifiedItem
        })
        changedItems.forEach((item) => {
          this.items.get(collection.name)?.set(serializeValue(item.id), item)
        })
        await this.storageAdapters.get(collection.name)?.replace(changedItems)

        this.rebuildIndicesIfOutdated(collection)
        this.updateQueries(collection, {
          added: [],
          modified: changedItems,
          removed: [],
        })
        return changedItems
      },
      replaceOne: async (selector, replacement) => {
        const item = this.getItem(collection, selector)
        if (item == null) return [] // no item found

        const hasItemWithSameId = item.id !== replacement.id
          && replacement.id != null
          && this.getItem(collection, { id: replacement.id } as Selector<T>) != null
        if (hasItemWithSameId) {
          throw new Error(`Item with id '${replacement.id as string}' already exists`)
        }
        const modifiedItem = { id: item.id, ...replacement } as T

        this.items.get(collection.name)?.set(serializeValue(modifiedItem.id), modifiedItem)
        await this.storageAdapters.get(collection.name)?.replace([modifiedItem])

        this.rebuildIndicesIfOutdated(collection)

        this.updateQueries(collection, {
          added: [],
          modified: [modifiedItem],
          removed: [],
        })
        return [modifiedItem]
      },
      removeOne: async (selector) => {
        const item = this.getItem(collection, selector)
        if (item == null) return [] // no item found
        this.items.get(collection.name)?.delete(serializeValue(item.id))
        await this.storageAdapters.get(collection.name)?.remove([item])

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
          this.items.get(collection.name)?.delete(serializeValue(item.id))
          this.rebuildIndicesIfOutdated(collection)
        })
        await this.storageAdapters.get(collection.name)?.remove(items)

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
        const emitter = this.queryEmitters.get(collection.name)
        if (!emitter) throw new Error(`Query emitter not found for collection ${collection.name}`)
        emitter.emit('change', selector, options, 'complete')
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
        if (adapter?.teardown) await adapter.teardown()
        this.storageAdapters.delete(collection.name)
        this.items.delete(collection.name)
        this.indicesOutdated.delete(collection.name)
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
