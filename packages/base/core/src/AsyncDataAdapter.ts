import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type StorageAdapter from './types/StorageAdapter'
import type Selector from './types/Selector'
import type Modifier from './types/Modifier'
import type { FlatSelector } from './types/Selector'

import deepClone from './utils/deepClone'
import match from './utils/match'
import modify from './utils/modify'
import queryId from './utils/queryId'
import isEqual from './utils/isEqual'
import getIndexInfo from './getIndexInfo'
import getMatchingKeys from './utils/getMatchingKeys'
import sortItems from './utils/sortItems'
import project from './utils/project'

export interface AsyncDataAdapterOptions {
  /** Factory to obtain a StorageAdapter per collection name */
  storage: (name: string) => StorageAdapter<any, any>,
  /** Optional logical id (handy if you run multiple adapters side-by-side) */
  id?: string,
  /** Optional error hook (mirrors WorkerDataAdapterHost) */
  onError?: (error: Error) => void,
}

type QueryState = 'active' | 'complete' | 'error'

type QueryRecord<T extends BaseItem<I>, I = any> = {
  selector: Selector<T>,
  options?: QueryOptions<T>,
  state: QueryState,
  error: Error | null,
  items: T[],
  listeners: Set<(state: QueryState) => void>,
}

/**
 * AsyncDataAdapter
 * Combines WorkerDataAdapter + WorkerDataAdapterHost into a single, transport-free adapter.
 * - Keeps the DataAdapter/CollectionBackend surface identical to the Worker version.
 * - Executes queries and mutations directly against the provided StorageAdapter.
 * - Preserves index-aware query optimization and push-style query updates to listeners.
 */
export default class AsyncDataAdapter implements DataAdapter {
  private id: string
  private onError: (error: Error) => void

  // Per-collection resources
  private storageAdapters = new Map<string, StorageAdapter<any, any>>()
  private storageAdapterReady = new Map<string, Promise<void>>()
  private collectionIndices = new Map<string, string[]>()

  // Per-collection query registries
  private queries: Map<string, Map<string, QueryRecord<any>>> = new Map()

  constructor(private options: AsyncDataAdapterOptions) {
    this.id = options.id || 'async-data-adapter'
    this.onError = options.onError ?? ((error) => {
      /* eslint-disable no-console */ console.error(error)
    })
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    indices: string[],
  ): CollectionBackend<T, I> {
    // init per-collection state
    this.collectionIndices.set(collection.name, indices)
    this.queries.set(collection.name, new Map())
    this.ensureStorageAdapter(collection.name)

    const ready = (async () => {
      try {
        await this.setupStorage(collection.name, indices)
      } catch (error) {
        // Handle inside the same async task to avoid unhandled rejections
        this.onError(error as Error)
        throw error
      }
    })()
    this.storageAdapterReady.set(collection.name, ready)
    // don't block createCollectionBackend; callers can await isReady()

    const registerQuery = (selector: Selector<T>, options?: QueryOptions<T>) => {
      const qid = queryId(selector, options)
      const registry = this.queries.get(collection.name)
      if (!registry) throw new Error(`Collection ${collection.name} not initialized!`)
      registry.set(qid, {
        selector,
        options,
        items: [],
        listeners: new Set(),
        ...registry.get(qid),
        state: 'active',
        error: null,
      })
      // kick async execution
      void this.fulfillQuery(collection.name, selector, options).catch(this.onError)
    }

    const unregisterQuery = (selector: Selector<T>, options?: QueryOptions<T>) => {
      const qid = queryId(selector, options)
      this.queries.get(collection.name)?.delete(qid)
    }

    const getQueryState = (selector: Selector<T>, options?: QueryOptions<T>): QueryState => {
      const q = this.queries.get(collection.name)?.get(queryId(selector, options))
      return q?.state ?? 'active'
    }

    const getQueryError = (selector: Selector<T>, options?: QueryOptions<T>): Error | null => {
      const q = this.queries.get(collection.name)?.get(queryId(selector, options))
      return q?.error ?? null
    }

    const getQueryResult = (selector: Selector<T>, options?: QueryOptions<T>): T[] => {
      const q = this.queries.get(collection.name)?.get(queryId(selector, options))
      return (q?.items as T[]) ?? []
    }

    const onQueryStateChange = (
      selector: Selector<T>,
      options: QueryOptions<T> | undefined,
      callback: (state: QueryState) => void,
    ) => {
      const qid = queryId(selector, options)
      const registry = this.queries.get(collection.name)
      if (!registry) throw new Error(`Collection ${collection.name} not initialized!`)
      // ensure the record exists so we have a listener bucket
      if (!registry.has(qid)) {
        registry.set(qid, {
          selector,
          options,
          state: 'active',
          error: null,
          items: [],
          listeners: new Set(),
        })
      }
      registry.get(qid)?.listeners.add(callback)
      return () => registry.get(qid)?.listeners.delete(callback)
    }

    return {
      insert: async (item) => {
        await ready
        const inserted = await this.insert(collection.name, item)
        return inserted
      },
      updateOne: async (selector, modifier) => {
        await ready
        return this.updateOne(collection.name, selector, modifier)
      },
      updateMany: async (selector, modifier) => {
        await ready
        return this.updateMany(collection.name, selector, modifier)
      },
      replaceOne: async (selector, replacement) => {
        await ready
        return this.replaceOne(collection.name, selector, replacement)
      },
      removeOne: async (selector) => {
        await ready
        return this.removeOne(collection.name, selector)
      },
      removeMany: async (selector) => {
        await ready
        return this.removeMany(collection.name, selector)
      },

      registerQuery,
      unregisterQuery,
      getQueryState,
      getQueryError,
      getQueryResult,
      onQueryStateChange,
      executeQuery: async (selector, options) => {
        await ready
        registerQuery(selector, options)
        const result = getQueryResult(selector, options)
        unregisterQuery(selector, options)
        return result
      },

      dispose: async () => {
        // mirror host.unregisterCollection semantics
        this.storageAdapters.delete(collection.name)
        this.queries.delete(collection.name)
        this.collectionIndices.delete(collection.name)
        this.storageAdapterReady.delete(collection.name)
      },

      isReady: async () => {
        await ready
      },
    }
  }

  private async setupStorage(collectionName: string, indices: string[]) {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    await Promise.all(indices.map(index => storage.createIndex(index)))
    await storage.setup()
  }

  private ensureStorageAdapter(name: string) {
    if (this.storageAdapters.has(name)) return
    const adapter = this.options.storage(name)
    if (!adapter) return
    this.storageAdapters.set(name, adapter)
  }

  /**
   * Compute and publish the result for a specific query
   * @param collectionName - name of the collection
   * @param selector - query selector
   * @param options - query options
   */
  private async fulfillQuery<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    options?: QueryOptions<T>,
  ) {
    const qid = queryId(selector, options)
    const registry = this.queries.get(collectionName)
    if (!registry) throw new Error(`Collection ${collectionName} not initialized!`)
    const rec = registry.get(qid)
    if (!rec) return

    this.publishState(collectionName, qid, 'active', null)

    try {
      const items = await this.executeQuery<T, I>(collectionName, selector, options)
      this.publishResult(collectionName, qid, items)
      this.publishState(collectionName, qid, 'complete', null)
    } catch (error) {
      this.publishState(collectionName, qid, 'error', error as Error)
    }
  }

  /**
   * Notify listeners about state changes and keep the cache updated
   * @param collectionName - name of the collection
   * @param qid - query id
   * @param state - new state
   * @param error - error if state is 'error', null otherwise
   */
  private publishState(
    collectionName: string,
    qid: string,
    state: QueryState,
    error: Error | null,
  ) {
    const rec = this.queries.get(collectionName)?.get(qid)
    if (!rec) return
    rec.state = state
    rec.error = error
    // notify subscribers
    for (const callback of rec.listeners) {
      try {
        callback(state)
      } catch (error_) {
        this.onError(error_ as Error)
      }
    }
  }

  private publishResult<T>(collectionName: string, qid: string, items: T[]) {
    const rec = this.queries.get(collectionName)?.get(qid)
    if (!rec) return
    rec.items = items as any[]
  }

  private async getIndexInfo<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ) {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    if (selector != null
      && Object.keys(selector).length === 1
      && 'id' in selector
      && typeof selector.id !== 'object') {
      return {
        matched: true,
        ids: [selector.id].filter(Boolean),
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

    const indices = this.collectionIndices.get(collectionName) ?? []
    return getIndexInfo(
      indices.map(field => async (flatSelector: FlatSelector<T>) => {
        if (!Object.hasOwnProperty.call(flatSelector, field)) return { matched: false }

        const index = await storageAdapter.readIndex(field) as Map<string | null, Set<I>>
        const fieldSelector = (flatSelector as Record<string, any>)[field]
        const filtersForNull = fieldSelector == null || fieldSelector.$exists === false

        const keys = filtersForNull
          ? { include: null, exclude: [...index.keys()].filter(key => key != null) }
          : getMatchingKeys<T, I>(field, flatSelector)

        if (keys.include == null && keys.exclude == null) return { matched: false }

        // Build included ids
        let includedIds: I[] = []
        if (keys.include == null) {
          for (const set of index.values()) for (const pos of set) includedIds.push(pos)
        } else {
          for (const key of keys.include) {
            const idSet = index.get(key)
            if (idSet) for (const id of idSet) includedIds.push(id)
          }
        }

        // Apply exclusions
        if (keys.exclude != null) {
          const excludeIds = new Set<I>()
          for (const key of keys.exclude) {
            const idSet = index.get(key)
            if (idSet) for (const id of idSet) excludeIds.add(id)
          }
          includedIds = includedIds.filter(pos => !excludeIds.has(pos))
        }

        return { matched: true, ids: includedIds, fields: [field], keepSelector: filtersForNull }
      }),
      selector,
    )
  }

  private async queryItems<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ): Promise<T[]> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const index = await this.getIndexInfo<T, I>(collectionName, selector)
    const matchItems = (item: T) => {
      if (index.optimizedSelector == null) return true
      if (Object.keys(index.optimizedSelector).length <= 0) return true
      return match(item, index.optimizedSelector)
    }

    if (index.matched) {
      const items = await storage.readIds(index.ids)
      if (isEqual(index.optimizedSelector, {})) return items
      return items.filter(matchItems)
    } else {
      const allItems = await storage.readAll()
      if (isEqual(selector, {})) return allItems
      return allItems.filter(matchItems)
    }
  }

  private async executeQuery<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    options?: QueryOptions<T>,
  ): Promise<T[]> {
    const items = await this.queryItems<T, I>(collectionName, selector || {})
    const { sort, skip, limit, fields } = options || {}

    const sorted = sort ? sortItems(items, sort) : items
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped

    const idExcluded = fields && fields.id === 0
    return limited.map((item) => {
      if (!fields) return item
      return { ...(idExcluded ? {} : { id: item.id }), ...project(item, fields) } as T
    })
  }

  /**
   * After mutations, recompute and push updates for affected active queries
   * @param collectionName - name of the collection
   * @param changedItems - items that were inserted/updated/replaced/removed
   */
  private async checkQueryUpdates<T extends BaseItem<I>, I = any>(
    collectionName: string,
    changedItems: T[],
  ) {
    const registry = this.queries.get(collectionName)
    if (!registry) throw new Error(`Collection ${collectionName} not initialized!`)
    if (registry.size === 0) return

    // Find active queries whose selector matches at least one changed item
    const affected = [...registry.values()].filter(({ selector }) =>
      changedItems.some(item => match(item, selector)),
    )
    if (affected.length === 0) return

    // Mark active and notify…
    for (const { selector, options } of affected) {
      const qid = queryId(selector, options)
      this.publishState(collectionName, qid, 'active', null)
    }

    // …then recompute and complete
    await Promise.all(affected.map(async ({ selector, options }) => {
      const qid = queryId(selector, options)
      try {
        const items = await this.executeQuery<T, I>(collectionName, selector, options)
        this.publishResult(collectionName, qid, items)
        this.publishState(collectionName, qid, 'complete', null)
      } catch (error) {
        this.publishState(collectionName, qid, 'error', error as Error)
      }
    }))
  }

  private async insert<T extends BaseItem<I>, I = any>(
    collectionName: string,
    newItem: T,
  ): Promise<T> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const existing = await this.executeQuery<T, I>(
      collectionName,
      { id: newItem.id } as Selector<T>,
      { limit: 1 },
    )
    if (existing.length > 0) throw new Error(`Item with id ${String(newItem.id)} already exists`)

    await storage.insert([newItem])
    await this.checkQueryUpdates(collectionName, [newItem])
    return newItem
  }

  private async updateOne<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    modifier: Modifier<T>,
  ): Promise<T[]> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const items = await this.executeQuery<T, I>(collectionName, selector, { limit: 1 })
    const [item] = items
    const { $setOnInsert, ...rest } = modifier
    if (item == null) return []

    const modified = modify(deepClone(item), rest)
    if (item.id !== modified.id) {
      const existing = await this.executeQuery<T, I>(
        collectionName,
        { id: modified.id } as Selector<T>,
        { limit: 1 },
      )
      if (existing.length > 0) throw new Error(`Item with id ${String(modified.id)} already exists`)
    }

    await storage.replace([modified])
    await this.checkQueryUpdates(collectionName, [modified])
    return [modified]
  }

  private async updateMany<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    modifier: Modifier<T>,
  ): Promise<T[]> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const items = await this.executeQuery<T, I>(collectionName, selector)
    if (items.length === 0) return []

    const { $setOnInsert, ...rest } = modifier
    const changed = await Promise.all(items.map(async (item) => {
      const modified = modify(deepClone(item), rest)
      if (item.id !== modified.id) {
        const existing = await this.executeQuery<T, I>(
          collectionName,
          { id: modified.id } as Selector<T>,
          { limit: 1 },
        )
        if (existing.length > 0) throw new Error(`Item with id ${String(modified.id)} already exists`)
      }
      return modified
    }))
    await storage.replace(changed)
    await this.checkQueryUpdates(collectionName, changed)
    return changed
  }

  private async replaceOne<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>,
  ): Promise<T[]> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const items = await this.executeQuery<T, I>(collectionName, selector, { limit: 1 })
    const [item] = items
    if (item == null) return []

    const modified = { ...replacement, id: replacement.id ?? item.id } as T
    if (item.id !== modified.id) {
      const existing = await this.executeQuery<T, I>(
        collectionName,
        { id: modified.id } as Selector<T>,
        { limit: 1 },
      )
      if (existing.length > 0) throw new Error(`Item with id ${String(modified.id)} already exists`)
    }

    await storage.replace([modified])
    await this.checkQueryUpdates(collectionName, [modified])
    return [modified]
  }

  private async removeOne<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ): Promise<T[]> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const items = await this.executeQuery<T, I>(collectionName, selector, { limit: 1 })
    const [item] = items
    if (item == null) return []

    await storage.remove([item])
    await this.checkQueryUpdates(collectionName, [item])
    return [item]
  }

  private async removeMany<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ): Promise<T[]> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const items = await this.executeQuery<T, I>(collectionName, selector)
    if (items.length === 0) return []

    await storage.remove(items)
    await this.checkQueryUpdates(collectionName, items)
    return items
  }
}
