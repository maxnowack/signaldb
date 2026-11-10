import type { BaseItem } from './Collection'
import type Collection from './Collection'
import createIndex from './createIndex'
import getIndexInfo from './getIndexInfo'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type IndexProvider from './types/IndexProvider'
import type StorageAdapter from './types/StorageAdapter'
import type { Changeset } from './types/StorageAdapter'
import type Selector from './types/Selector'
import deepClone from './utils/deepClone'
import EventEmitter from './utils/EventEmitter'
import isEqual from './utils/isEqual'
import { createMatcher } from './utils/match'
import modify from './utils/modify'
import projectItems from './utils/projectItems'
import incrementalQueryUpdate from './utils/incrementalQueryUpdate'
import type { QueryChangeset } from './utils/incrementalQueryUpdate'
import { callWithDelta, diffQueryResults, isEmptyQueryDelta } from './utils/queryDelta'
import type { QueryDelta } from './utils/queryDelta'
import queryId from './utils/queryId'
import serializeValue from './utils/serializeValue'
import idIndexQuery from './utils/idIndexQuery'
import type { FlatSelector } from './types/Selector'
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
 * The result of each write made while a load from storage is in flight, by serialized id: the
 * item as written, or `null` for a removed item.
 */
type WritesDuringLoad = Map<string | null, BaseItem | null>

interface DefaultDataAdapterOptions {
  /**
   * Returns the storage adapter to persist a collection with, by collection name, or `undefined`
   * to keep that collection in memory only.
   */
  storage?: (name: string) => StorageAdapter<any, any> | undefined,
  /**
   * Called when setting up a collection's storage adapter or loading its items from it fails.
   * Without it, the error is logged with `console.error`. Errors of individual writes reject the
   * write instead.
   */
  onError?: (name: string, error: Error) => void,
}

/**
 * The default data adapter: keeps every collection's items in memory on the main thread,
 * answers queries synchronously from there, and maintains live query results incrementally.
 * With a storage adapter, a collection loads all of its items through `readAll` once and writes
 * every change through to storage.
 */
export default class DefaultDataAdapter implements DataAdapter {
  private items: Map<string, Map<string | null, BaseItem>> = new Map()
  private options: DefaultDataAdapterOptions
  private storageAdapters: Map<string, StorageAdapter<any, any>> = new Map()
  private collections = new Set<Collection<any, any, any, any>>()

  private indices: Map<
    string,
    IndexProvider<any, any>[]
  > = new Map()

  private activeQueries: Map<string, Map<string, {
    selector: Selector<any>,
    options?: QueryOptions<any>,
  }>> = new Map()

  private queryEmitters: Map<
    string,
    EventEmitter<{
      change: (
        selector: Selector<any>,
        options: QueryOptions<any> | undefined,
        state: 'active' | 'complete' | 'error',
        delta?: QueryDelta<any>,
      ) => void,
    }>
  > = new Map()

  private queuedQueryUpdates: Map<string, Changeset<any>> = new Map()
  private writesDuringLoads: Map<string, Set<WritesDuringLoad>> = new Map()
  private cachedQueryResults: Map<string, Map<string, BaseItem[]>> = new Map()

  /**
   * Creates a `DefaultDataAdapter`.
   * @param options - Optional configuration.
   * @param options.storage - Returns the storage adapter for a collection name, or `undefined`
   * for none.
   * @param options.onError - Called with the collection name and the error when setting up or
   * loading from a storage adapter fails; defaults to `console.error`.
   */
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

  private writeToMemory<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    { written = [], removed = [] }: { written?: T[], removed?: T[] },
  ) {
    const items = this.items.get(collection.name)
    const loads = this.writesDuringLoads.get(collection.name) ?? []
    for (const item of written) {
      const id = serializeValue(item.id)
      items?.set(id, item)
      for (const writes of loads) writes.set(id, item)
    }
    for (const item of removed) {
      const id = serializeValue(item.id)
      items?.delete(id)
      for (const writes of loads) writes.set(id, null)
    }
  }

  private trackWritesDuringLoad(collectionName: string) {
    const writes: WritesDuringLoad = new Map()
    const loads = this.writesDuringLoads.get(collectionName) ?? new Set<WritesDuringLoad>()
    loads.add(writes)
    this.writesDuringLoads.set(collectionName, loads)
    return writes
  }

  private untrackWritesDuringLoad(collectionName: string, writes: WritesDuringLoad) {
    this.writesDuringLoads.get(collectionName)?.delete(writes)
  }

  private rebuildIndices<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    const items = this.items.get(collection.name)
    if (!items) throw new Error(`Items not found for collection ${collection.name}`)
    const indices = this.indices.get(collection.name)
    if (!indices) throw new Error(`Indices not found for collection ${collection.name}`)

    for (const index of indices) index.rebuild([...items.values()])
  }

  private async setupStorageAdapter<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    const storageAdapter = this.storageAdapters.get(collection.name)
    if (!storageAdapter) return // no storage adapter available

    // Writes made during `setup()` are not necessarily in storage yet when `readAll` reads it.
    const writes = this.trackWritesDuringLoad(collection.name)
    return storageAdapter.setup()
      // eslint-disable-next-line unicorn/prefer-await -- keeps the settle timing of isReady()
      .then(async () => {
        await this.loadItemsFromStorage(collection, storageAdapter, writes)
      })
      // eslint-disable-next-line unicorn/prefer-await -- keeps the settle timing of isReady()
      .catch((error: unknown) => {
        this.untrackWritesDuringLoad(collection.name, writes)
        const storageError = error instanceof Error ? error : new Error(String(error))
        if (this.options.onError) {
          this.options.onError(collection.name, storageError)
        } else {
          // eslint-disable-next-line no-console
          console.error(`Error during storage operation in collection ${collection.name}`, storageError)
        }
        throw storageError
      })
  }

  private async loadItemsFromStorage<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    storageAdapter: StorageAdapter<any, any>,
    writes: WritesDuringLoad,
  ) {
    try {
      const storedItems: T[] = await storageAdapter.readAll()
      const items = new Map<string | null, BaseItem>()
      for (const item of storedItems) items.set(serializeValue(item.id), item)
      // `readAll` may or may not include these writes; their results are applied, not the
      // operations, so applying them again to a result that already has them changes nothing.
      for (const [id, item] of writes) {
        if (item) items.set(id, item)
        else items.delete(id)
      }
      this.items.set(collection.name, items)
      this.rebuildIndices(collection)

      // A query cached before the load still holds the items it saw then; the
      // load replaced them wholesale, so each one is executed again.
      const activeQueries = [...this.activeQueries.get(collection.name)?.values() ?? []]
      for (const { selector, options } of activeQueries) {
        this.executeAndCacheQuery(collection, selector, options)
      }
    } finally {
      this.untrackWritesDuringLoad(collection.name, writes)
    }
  }

  private getIndexInfo<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector?: Selector<T>,
  ) {
    if (selector != null && Object.keys(selector).length === 1 && 'id' in selector) {
      const idResult = idIndexQuery<T, I>(selector as FlatSelector<T>)
      if (idResult.matched) {
        return {
          // This adapter keys its in-memory map by `serializeValue(id)`.
          matched: true,
          ids: idResult.ids.map(id => serializeValue(id)),
          optimizedSelector: {},
        }
      }
    }

    if (selector == null) {
      return {
        matched: false,
        ids: [],
        optimizedSelector: {},
      }
    }

    return getIndexInfo(
      (this.indices.get(collection.name) ?? []).map(i => i.query.bind(i)),
      selector,
    )
  }

  private applyIndexDeltas<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    changes: {
      added?: T[],
      modified?: { oldItem: T, newItem: T }[],
      removed?: T[],
    },
  ) {
    const indices = this.indices.get(collection.name) ?? []
    for (const index of indices) {
      if (changes.modified) index.update(changes.modified)
      if (changes.added && changes.added.length > 0) index.insert(changes.added)
      if (changes.removed && changes.removed.length > 0) index.remove(changes.removed)
    }
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
    const isMatching = createMatcher(selector)
    const item = items.find(document => isMatching(document as T)) as T
    return item
  }

  private queryItems<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector: Selector<T>,
  ) {
    const indexInfo = this.getIndexInfo(collection, selector)
    // No selector, or an empty one, matches every item — which is what an empty selector compiles
    // to.
    const isMatchingItem = createMatcher<T>(indexInfo.optimizedSelector ?? {})

    const items = this.items.get(collection.name) as Map<string | null, T>

    // no index available, use complete memory
    if (!indexInfo.matched) {
      const all = [...items.values()]
      return isEqual(selector, {}) ? all : all.filter(isMatchingItem)
    }

    const foundItems = indexInfo.ids.map(ids =>
      items.get(serializeValue(ids)) as T).filter(i => i != null)
    return isEqual(indexInfo.optimizedSelector, {}) ? foundItems : foundItems.filter(isMatchingItem)
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
    return projectItems(limited, fields)
  }

  private flushQueuedQueryUpdates<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
  ) {
    if (!this.queuedQueryUpdates.get(collection.name)) return
    const changes = this.queuedQueryUpdates.get(collection.name)
    if (!changes || !hasPendingUpdates(changes)) return
    this.queuedQueryUpdates.set(collection.name, { added: [], modified: [], removed: [] })

    const changeset: QueryChangeset<T> = {
      upserts: [...changes.added, ...changes.modified],
      deletes: changes.removed.map(item => item.id),
    }
    const flatItems = [...changes.added, ...changes.modified, ...changes.removed]
    const itemIds = new Set(flatItems.map(i => i.id))
    const queries = [
      ...this.activeQueries.get(collection.name)?.values() ?? [],
    ].filter(({ selector, options }) => {
      const idsInQuery = this.cachedQueryResults.get(collection.name)
        ?.get(queryId(selector, options))
        ?.map(i => i.id) ?? []

      // update queries that contained changed items previously
      return idsInQuery.some(id => itemIds.has(id)) || flatItems.some(createMatcher(selector))
    })

    for (const { selector, options } of queries) {
      this.executeAndCacheQuery(collection, selector, options, changeset)
    }
  }

  private executeAndCacheQuery<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    selector: Selector<T>,
    options?: QueryOptions<T>,
    changes?: QueryChangeset<T>,
  ) {
    const cached = this.cachedQueryResults.get(collection.name)?.get(queryId(selector, options))
    // With the change in hand and the previous result cached, the query can be brought up to date
    // without walking every item this collection holds — and the listeners can be told what
    // changed instead of being left to compare the two results themselves.
    const incremental = changes && cached
      ? incrementalQueryUpdate(cached as T[], selector, options, changes)
      : null
    const result = incremental ?? this.executeQuery(collection, selector, options)
    const delta = cached ? diffQueryResults(cached as T[], result) : undefined

    this.cachedQueryResults.set(
      collection.name,
      this.cachedQueryResults.get(collection.name) || new Map<string, BaseItem[]>(),
    )

    this.cachedQueryResults.get(collection.name)?.set(
      queryId(selector, options),
      result as BaseItem[],
    )

    const emitter = this.queryEmitters.get(collection.name)
    if (!emitter) return
    if (delta && isEmptyQueryDelta(delta)) return

    emitter.emit('change', selector, options, 'complete', delta)
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
    indices: string[],
  ): CollectionBackend<T, I> {
    this.collections.add(collection)
    this.ensureStorageAdapter(collection.name)
    this.items.set(collection.name, this.items.get(collection.name) ?? new Map<string | null, T>())
    this.queryEmitters.set(
      collection.name,
      this.queryEmitters.get(collection.name) ?? new EventEmitter<{
        change: (
          selector: Selector<any>,
          options: QueryOptions<any> | undefined,
          state: 'active' | 'complete' | 'error',
          delta?: QueryDelta<any>,
        ) => void,
      }>(),
    )

    // we might have many active queries
    this.queryEmitters.get(collection.name)?.setMaxListeners(Infinity)

    this.activeQueries.set(
      collection.name,
      this.activeQueries.get(collection.name) || new Map<string, {
        selector: Selector<T>,
        options?: QueryOptions<T>,
      }>(),
    )

    this.indices.set(collection.name, indices.map(field => createIndex(field)))

    this.rebuildIndices(collection)

    const persistenceReadyPromise = this.setupStorageAdapter(collection)
    // The failure has already gone to `onError`; `isReady()` still rejects for whoever awaits it.
    // eslint-disable-next-line unicorn/prefer-await -- only marks the rejection as handled
    persistenceReadyPromise.catch(() => { /* reported above */ })

    const backend: CollectionBackend<T, I> = {
      // CRUD operations
      insert: async (newItem) => {
        const items = this.items.get(collection.name)
        if (!items) throw new Error(`Items not found for collection ${collection.name}`)
        if (items.has(serializeValue(newItem.id))) {
          throw new Error(`Item with id '${newItem.id as string}' already exists`)
        }
        this.writeToMemory(collection, { written: [newItem] })
        await this.storageAdapters.get(collection.name)?.insert([newItem])
        this.applyIndexDeltas(collection, { added: [newItem] })
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

        this.writeToMemory(collection, { written: [modifiedItem] })
        await this.storageAdapters.get(collection.name)?.replace([modifiedItem])
        this.applyIndexDeltas(collection, { modified: [{ oldItem: item, newItem: modifiedItem }] })

        this.updateQueries(collection, {
          added: [],
          modified: [modifiedItem],
          removed: [],
        })
        return { items: [modifiedItem], previousItems: [item] }
      },
      updateMany: async (selector, modifier) => {
        const { $setOnInsert, ...restModifier } = modifier
        const items = this.executeQuery(collection, selector, {})

        const changedItems = items.map((item) => {
          const modifiedItem = modify(deepClone(item), restModifier)
          const hasItemWithSameId = item.id !== modifiedItem.id
            && this.getItem(collection, { id: modifiedItem.id } as Selector<T>) != null
          if (hasItemWithSameId) {
            throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
          }

          return modifiedItem
        })
        this.writeToMemory(collection, { written: changedItems })
        await this.storageAdapters.get(collection.name)?.replace(changedItems)

        const pairs = items.map((oldItem, index) => ({ oldItem, newItem: changedItems[index] }))
        this.applyIndexDeltas(collection, { modified: pairs })
        this.updateQueries(collection, {
          added: [],
          modified: changedItems,
          removed: [],
        })
        return { items: changedItems, previousItems: items }
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

        this.writeToMemory(collection, { written: [modifiedItem] })
        await this.storageAdapters.get(collection.name)?.replace([modifiedItem])

        this.applyIndexDeltas(collection, { modified: [{ oldItem: item, newItem: modifiedItem }] })

        this.updateQueries(collection, {
          added: [],
          modified: [modifiedItem],
          removed: [],
        })
        return { items: [modifiedItem], previousItems: [item] }
      },
      removeOne: async (selector) => {
        const item = this.getItem(collection, selector)
        if (item == null) return [] // no item found
        this.writeToMemory(collection, { removed: [item] })
        await this.storageAdapters.get(collection.name)?.remove([item])

        this.applyIndexDeltas(collection, { removed: [item] })
        this.updateQueries(collection, {
          added: [],
          modified: [],
          removed: [item],
        })
        return [item]
      },
      removeMany: async (selector) => {
        const items = backend.getQueryResult(selector, {})

        this.writeToMemory(collection, { removed: items })
        await this.storageAdapters.get(collection.name)?.remove(items)
        this.applyIndexDeltas(collection, { removed: items })

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
        this.executeAndCacheQuery(collection, selector, options)
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
          delta?: QueryDelta<any>,
        ) => {
          if (queryId(querySelector, queryOptions) !== queryId(selector, options)) return
          callWithDelta(callback, state, delta)
        }
        emitter.on('change', handler)
        return () => {
          emitter.off('change', handler)
        }
      },
      getQueryError: () => null,
      getQueryResult: (selector, options) => {
        const isQueryActive = this.activeQueries.get(collection.name)
          ?.has(queryId(selector, options))
        if (isQueryActive) {
          const results = this.cachedQueryResults
            .get(collection.name)
            ?.get(queryId(selector, options))
          if (!results) throw new Error('Cached query results are not defined!')
          return results as T[]
        }
        return this.executeQuery(collection, selector, options)
      },

      executeQuery: (selector, options) =>
        Promise.resolve(this.executeQuery(collection, selector, options)),

      // lifecycle methods
      dispose: async () => {
        const adapter = this.storageAdapters.get(collection.name)
        if (adapter?.teardown) await adapter.teardown()
        this.storageAdapters.delete(collection.name)
        this.items.delete(collection.name)
        this.indices.delete(collection.name)
        this.activeQueries.delete(collection.name)
        this.queryEmitters.delete(collection.name)
        this.queuedQueryUpdates.delete(collection.name)
        this.cachedQueryResults.delete(collection.name)
        this.writesDuringLoads.delete(collection.name)
      },
      isReady: () => persistenceReadyPromise,
    }

    return backend
  }

  /**
   * Replaces a collection's in-memory items with everything its storage adapter holds,
   * rebuilds its indices and re-runs its active queries, so a query registered before the
   * load sees the loaded items. Does nothing for a collection without a storage adapter.
   * Writes made while the items are loading are kept: they are newer than what storage
   * returned.
   * @param collection - The collection to reload; omit to reload every collection of this adapter.
   * @returns A promise that resolves once the items are loaded.
   */
  public async fetchItemsFromStorage<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection?: Collection<T, I, E, U>,
  ) {
    if (!collection) {
      await Promise.all([...this.collections]
        .map(currentCollection => this.fetchItemsFromStorage(currentCollection)))
      return
    }

    const storageAdapter = this.storageAdapters.get(collection.name)
    if (!storageAdapter) return // no storage adapter available

    await this.loadItemsFromStorage(
      collection,
      storageAdapter,
      this.trackWritesDuringLoad(collection.name),
    )
  }
}
