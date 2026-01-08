import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type StorageAdapter from './types/StorageAdapter'
import type Selector from './types/Selector'
import type { FlatSelector } from './types/Selector'
import type Modifier from './types/Modifier'
import deepClone from './utils/deepClone'
import match from './utils/match'
import modify from './utils/modify'
import queryId from './utils/queryId'
import isEqual from './utils/isEqual'
import getIndexInfo from './getIndexInfo'
import getMatchingKeys from './utils/getMatchingKeys'
import sortItems from './utils/sortItems'
import project from './utils/project'

/**
 * Default merge strategy: shallow spread (right wins)
 * @param a first item
 * @param b second item
 * @returns merged item
 */
function defaultMergeItems<T extends BaseItem<any>>(a: T, b: T): T {
  return { ...a, ...b }
}

/**
 * Generates a stable key for a selector
 * @param selector - the selector
 * @returns the key
 */
function selectorId<T extends BaseItem>(selector: Selector<T>) {
  return JSON.stringify(selector ?? {})
}

/**
 * AutoFetchDataAdapterOptions
 *
 * Merges the core options required to talk to a per-collection StorageAdapter with
 * the auto-fetch behavior inspired by AutoFetchCollection.
 */
export interface AutoFetchDataAdapterOptions {
  /** Factory to obtain a StorageAdapter per collection name */
  storage?: (name: string) => StorageAdapter<any, any>,
  /** Optional logical id (handy if you run multiple adapters side-by-side) */
  id?: string,
  /** Optional error hook */
  onError?: (error: Error) => void,

  /**
   * Fetch hook: given a selector, retrieve items from a remote source.
   * Must resolve to an object with an `items` array. Items MUST include an `id`.
   */
  fetchQueryItems: (
    collectionName: string,
    selector: Selector<BaseItem>,
  ) => Promise<BaseItem[] | undefined>,

  /**
   * Optional: called once at adapter construction to subscribe to remote changes.
   * When invoked, call the provided callback whenever the remote source changed
   * and all active queries should be re-fetched.
   */
  registerRemoteChange?: (onChange: () => Promise<void>) => Promise<void>,

  /**
   * Merge strategy for ingesting freshly fetched items with existing ones.
   * Default is shallow spread (right wins).
   */
  mergeItems?: <T extends BaseItem<any>>(a: T, b: T) => T,

  /**
   * Delay (ms) before purging auto-fetched items for a query after the query
   * becomes inactive. Set to 0 to purge immediately. Default: 10s.
   */
  purgeDelay?: number,
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
 * AutoFetchDataAdapter
 *
 * A DataAdapter that:
 * - Mirrors the CollectionBackend surface (CRUD + query registry + lifecycle)
 * - Executes queries against a provided StorageAdapter (local cache)
 * - On first registration of a selector, auto-fetches from a remote source and
 *   ingests the result into storage (upsert), then pushes query result updates
 * - Optionally purges auto-fetched items for a selector once no observers remain
 * - Can subscribe to remote change notifications to re-fetch active selectors
 *
 * IMPORTANT: Purging only ever deletes items that were introduced via the
 * auto-fetch path and are no longer referenced by any active selector. Items
 * inserted through CRUD calls are never purged.
 */
export default class AutoFetchDataAdapter implements DataAdapter {
  private id: string
  private onError: (error: Error) => void
  private fetchQueryItems: AutoFetchDataAdapterOptions['fetchQueryItems']
  private mergeItems: <T extends BaseItem<any>>(a: T, b: T) => T
  private purgeDelay: number

  // Per-collection resources
  private storageAdapters = new Map<string, StorageAdapter<any, any>>()
  private storageAdapterReady = new Map<string, Promise<void>>()
  private collectionIndices = new Map<string, string[]>()

  // Per-collection query registries and auto-fetch bookkeeping
  private queries: Map<string, Map<string, QueryRecord<any>>> = new Map()
  private activeObservers: Map<string, Map<string, {
    selector: Selector<any>,
    count: number,
  }>> = new Map() // per-collection: key->record

  private observerTimeouts: Map<string, Map<string, ReturnType<typeof setTimeout>>> = new Map() // per-collection
  private selectorIds: Map<string, Map<string, Set<any>>> = new Map() // per-collection: selectorKey -> Set<id>
  private idRefCounts: Map<string, Map<any, number>> = new Map() // per-collection: id -> refcount (for auto-fetched items)
  private autoloadIds: Map<string, Set<any>> = new Map() // per-collection: ids that were introduced via auto-fetch

  constructor(private options: AutoFetchDataAdapterOptions) {
    this.id = options.id || 'autofetch-data-adapter'
    this.onError = options.onError ?? ((error) => {
      /* eslint-disable no-console */ console.error(error)
    })
    this.fetchQueryItems = options.fetchQueryItems
    this.mergeItems = options.mergeItems ?? defaultMergeItems
    this.purgeDelay = options.purgeDelay ?? 10_000

    if (options.registerRemoteChange) {
      void options.registerRemoteChange(async () => {
        await this.forceRefetchAll()
      })
    }
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    indices: string[],
  ): CollectionBackend<T, I> {
    // init per-collection state
    this.collectionIndices.set(collection.name, indices)
    this.queries.set(collection.name, new Map())
    this.ensureStorageAdapter(collection.name)
    this.activeObservers.set(collection.name, new Map())
    this.observerTimeouts.set(collection.name, new Map())
    this.selectorIds.set(collection.name, new Map())
    this.idRefCounts.set(collection.name, new Map())
    this.autoloadIds.set(collection.name, new Set())

    const ready = this.setupStorage(collection.name, indices)
    this.storageAdapterReady.set(collection.name, ready)

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

      // auto-fetch lifecycle
      const key = selectorId(selector)
      const perColObservers = this.activeObservers.get(collection.name)
      const current = perColObservers?.get(key)?.count ?? 0
      perColObservers?.set(key, { selector, count: current + 1 })

      // cancel scheduled purge if any
      const timeouts = this.observerTimeouts.get(collection.name)
      const t = timeouts?.get(key)
      if (t) clearTimeout(t)

      // Kick async fetch on first observer
      if (current === 0) {
        void this.fetchAndIngest(collection.name, selector).catch(this.onError)
      }

      // Also compute the current local result for immediate availability
      void this.fulfillQuery(collection.name, selector, options).catch(this.onError)
    }

    const unregisterQuery = (selector: Selector<T>, options?: QueryOptions<T>) => {
      const qid = queryId(selector, options)
      const registry = this.queries.get(collection.name)
      registry?.delete(qid)

      const key = selectorId(selector)
      const perColObservers = this.activeObservers.get(collection.name)
      const current = perColObservers?.get(key)?.count ?? 0
      const remaining = Math.max(0, current - 1)

      if (remaining > 0) {
        perColObservers?.set(key, { selector, count: remaining })
        return
      }

      // schedule purge of auto-fetched items for this selector
      const doPurge = () => {
        perColObservers?.delete(key)
        void this.purgeSelector(collection.name, selector).catch(this.onError)
      }

      if (this.purgeDelay === 0) {
        doPurge()
      } else {
        const timeouts = this.observerTimeouts.get(collection.name)
        const t = timeouts?.get(key)
        if (t) clearTimeout(t)
        timeouts?.set(key, setTimeout(doPurge, this.purgeDelay))
      }
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
      return () => {
        registry.get(qid)?.listeners.delete(callback)
      }
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
        await new Promise<void>((resolve) => {
          let stop = () => {}
          stop = onQueryStateChange(selector, options, (state) => {
            if (state === 'active') return
            resolve()
            stop()
          })
        })
        const result = getQueryResult(selector, options)
        unregisterQuery(selector, options)
        return result
      },

      dispose: async () => {
        this.storageAdapters.delete(collection.name)
        this.queries.delete(collection.name)
        this.collectionIndices.delete(collection.name)
        this.storageAdapterReady.delete(collection.name)
        this.activeObservers.delete(collection.name)
        this.observerTimeouts.delete(collection.name)
        this.selectorIds.delete(collection.name)
        this.idRefCounts.delete(collection.name)
        this.autoloadIds.delete(collection.name)
      },

      isReady: async () => {
        await ready
      },
    }
  }

  // ===== Auto-fetch mechanics =====

  private async forceRefetchAll() {
    const tasks: Promise<void>[] = []
    for (const [collectionName, observers] of this.activeObservers.entries()) {
      for (const { selector, count } of observers.values()) {
        if (count > 0) tasks.push(this.fetchAndIngest(collectionName, selector))
      }
    }
    await Promise.all(tasks)
  }

  private async fetchAndIngest<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ) {
    // mark queries covering this selector as active (for UX spinners)
    this.publishForSelector(collectionName, selector, 'active', null)

    try {
      const items = await this.fetchQueryItems(collectionName, selector) as T[] | undefined
      if (!items || !Array.isArray(items)) {
        throw new Error('AutoFetchDataAdapter: fetchQueryItems must resolve to { items: T[] }')
      }

      const ids = items.map(i => i.id)

      // Track selector->ids for purge calculations
      const selectorKey = selectorId(selector)
      const selMap = this.selectorIds.get(collectionName)
      const previous = selMap?.get(selectorKey) ?? new Set<I>()
      ids.forEach(id => previous.add(id))
      selMap?.set(selectorKey, previous)

      // Ingest via upsert (merge when existing)
      await this.upsertMerged(collectionName, items)

      // push updates to any queries that might be affected
      await this.checkQueryUpdates(collectionName, items)
    } catch (error) {
      this.publishForSelector(collectionName, selector, 'error', error as Error)
      this.onError(error as Error)
    }
  }

  private async purgeSelector<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ) {
    const selectorKey = selectorId(selector)
    const selMap = this.selectorIds.get(collectionName)
    const ids = selMap?.get(selectorKey)
    selMap?.delete(selectorKey)
    if (!ids || ids.size === 0) return

    const referenceMap = this.idRefCounts.get(collectionName)
    const autoload = this.autoloadIds.get(collectionName)
    const toRemove: I[] = []

    // Decrement reference counts and collect safe-to-remove ids
    for (const id of ids) {
      const current = referenceMap?.get(id) ?? 0
      const next = Math.max(0, current - 1)
      if (next === 0) {
        referenceMap?.delete(id)
        if (autoload?.has(id)) toRemove.push(id as I)
      } else {
        referenceMap?.set(id, next)
      }
    }

    if (toRemove.length === 0) return

    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    // Read and remove only those ids that still exist in storage
    const items = await storage.readIds(toRemove)
    if (items.length > 0) {
      await storage.remove(items)
      await this.checkQueryUpdates(collectionName, items)
    }

    // finally, clear autoload marks
    toRemove.forEach(id => autoload?.delete(id))
  }

  // ===== Core query + CRUD plumbing (index-aware, same semantics as AsyncDataAdapter) =====

  private async setupStorage(collectionName: string, indices: string[]) {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    await Promise.all(indices.map(field => storage.createIndex(field)))
    await storage.setup()
  }

  private ensureStorageAdapter(name: string) {
    if (this.storageAdapters.has(name)) return
    const adapter = this.options.storage && this.options.storage(name)
    if (!adapter) return
    this.storageAdapters.set(name, adapter)
  }

  private publishForSelector<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    state: QueryState,
    error: Error | null,
  ) {
    const registry = this.queries.get(collectionName)
    if (!registry) return

    for (const query of registry.values()) {
      // We only toggle state for records with an equal selector
      if (!isEqual(query.selector, selector)) continue
      this.publishState(collectionName, queryId(query.selector, query.options), state, error)
    }
  }

  private publishState(
    collectionName: string,
    qid: string,
    state: QueryState,
    error: Error | null,
  ) {
    const query = this.queries.get(collectionName)?.get(qid)
    if (!query) return
    query.state = state
    query.error = error
    for (const callback of query.listeners) {
      try {
        callback(state)
      } catch (error_) {
        this.onError(error_ as Error)
      }
    }
  }

  private publishResult<T>(collectionName: string, qid: string, items: T[]) {
    const query = this.queries.get(collectionName)?.get(qid)
    if (!query) return
    query.items = items as any[]
    this.queries.get(collectionName)?.set(qid, query)
  }

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

  private async getIndexInfo<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
  ) {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    // Fast path: { id: <scalar> }
    if (selector != null && Object.keys(selector).length === 1 && 'id' in selector && typeof (selector as any).id !== 'object') {
      return { matched: true, ids: [(selector as any).id as I], optimizedSelector: {} }
    }

    if (selector == null) {
      return { matched: false, ids: [], optimizedSelector: {} }
    }

    const indices = this.collectionIndices.get(collectionName) ?? []
    return getIndexInfo(
      indices.map(field => async (flatSelector: FlatSelector<T>) => {
        if (!Object.hasOwnProperty.call(flatSelector, field)) return { matched: false as const }

        const index = await storage.readIndex(field) as Map<string | null, Set<I>>
        const fieldSelector = (flatSelector as Record<string, any>)[field]
        const filtersForNull = fieldSelector == null || fieldSelector.$exists === false

        const keys = filtersForNull
          ? { include: null as any, exclude: [...index.keys()].filter(key => key != null) }
          : getMatchingKeys<T, I>(field, flatSelector)

        if (keys.include == null && keys.exclude == null) return { matched: false as const }

        // Build included ids
        let includedIds: I[] = []
        if ((keys as any).include == null) {
          for (const set of index.values()) for (const pos of set) includedIds.push(pos)
        } else {
          for (const key of (keys as any).include as (string | null)[]) {
            const idSet = index.get(key)
            if (idSet) for (const id of idSet) includedIds.push(id)
          }
        }

        // Apply exclusions
        if ((keys as any).exclude != null) {
          const excludeIds = new Set<I>()
          for (const key of (keys as any).exclude as (string | null)[]) {
            const idSet = index.get(key)
            if (idSet) for (const id of idSet) excludeIds.add(id)
          }
          includedIds = includedIds.filter(pos => !excludeIds.has(pos))
        }

        return {
          matched: true as const,
          ids: includedIds,
          fields: [field],
          keepSelector: filtersForNull,
        }
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

    if ((index as any).matched) {
      const items = await storage.readIds(index.ids)
      if (isEqual((index as any).optimizedSelector, {})) return items
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

    const idExcluded = fields && (fields as any).id === 0
    return limited.map((item) => {
      if (!fields) return item
      return { ...(idExcluded ? {} : { id: item.id }), ...project(item, fields) } as T
    })
  }

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

  // ===== CRUD with push-style query updates =====

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
    await this.checkQueryUpdates(collectionName, [item, modified])
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
    await this.checkQueryUpdates(collectionName, [...items, ...changed])
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
    await this.checkQueryUpdates(collectionName, [item, modified])
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

  // ===== Upsert/merge helper for ingesting fetched items =====

  private async upsertMerged<T extends BaseItem<I>, I = any>(
    collectionName: string,
    incoming: T[],
  ) {
    if (incoming.length === 0) return

    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const ids = incoming.map(i => i.id)
    const existing = await storage.readIds(ids)
    const existingById = new Map<any, T>(existing.map((it: T) => [it.id, it]))

    const toInsert: T[] = []
    const toReplace: T[] = []

    const referenceMap = this.idRefCounts.get(collectionName)
    const autoload = this.autoloadIds.get(collectionName)

    for (const item of incoming) {
      const previous = existingById.get(item.id)
      if (previous) {
        toReplace.push(this.mergeItems(previous, item))
      } else {
        toInsert.push(item)
      }
      // mark as auto-fetched and bump refcount
      autoload?.add(item.id)
      referenceMap?.set(item.id, (referenceMap?.get(item.id) ?? 0) + 1)
    }

    if (toInsert.length > 0) await storage.insert(toInsert)
    if (toReplace.length > 0) await storage.replace(toReplace)
  }
}

/**
 * Usage (example):
 *
 * const adapter = new AutoFetchDataAdapter({
 *   storage: (name) => new IndexedDBStorage(name),
 *   fetchQueryItems: async (collectionName, selector) => {
 *     const res = await fetch(`/api/${collectionName}?q=${encodeURIComponent(JSON.stringify(selector||{}))}`)
 *     const items = await res.json()
 *     return { items }
 *   },
 *   registerRemoteChange: (onChange) => subscribeToWS(onChange),
 *   mergeItems: (a, b) => ({ ...a, ...b }),
 *   purgeDelay: 10_000,
 * })
 *
 * const backend = adapter.createCollectionBackend(myCollection, ['status', 'projectId'])
 */
