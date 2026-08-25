import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions, StateChangeCallback } from './DataAdapter'
import type StorageAdapter from './types/StorageAdapter'
import type Selector from './types/Selector'
import type Modifier from './types/Modifier'

import deepClone from './utils/deepClone'
import match from './utils/match'
import modify from './utils/modify'
import queryId from './utils/queryId'
import isEqual from './utils/isEqual'
import getIndexInfo from './getIndexInfo'
import storageIndexQuery from './utils/storageIndexQuery'
import sortItems from './utils/sortItems'
import projectItems from './utils/projectItems'
import incrementalQueryUpdate from './utils/incrementalQueryUpdate'
import type { QueryChangeset } from './utils/incrementalQueryUpdate'
import { callWithDelta, diffQueryResults, isEmptyQueryDelta } from './utils/queryDelta'
import type { QueryDelta } from './utils/queryDelta'

export interface AsyncDataAdapterOptions {
  /** Factory to obtain a StorageAdapter per collection name */
  storage: (name: string) => StorageAdapter<any, any>,
  /** Optional logical id (handy if you run multiple adapters side-by-side) */
  id?: string,
  /** Optional error hook (mirrors WorkerDataAdapterHost) */
  onError?: (error: Error) => void,
  /**
   * How often a failing query is retried before it is published as `'error'`.
   * A query that fails is otherwise a dead end for the rest of the session —
   * cursors only requery on `'complete'`, so they keep serving their neutral
   * empty value, which consumers cannot tell apart from "there is no data".
   */
  retry?: {
    /** Total attempts including the first one. Default 3. */
    attempts?: number,
    /** Delay in ms before attempt N+1. Default 100 * 4 ** (attempt - 1). */
    delay?: (attempt: number) => number,
  },
}

/**
 * Carries the context needed to act on a failed query. The bare storage error
 * on its own does not say which collection or selector produced it, which made
 * the default `console.error` hook close to useless.
 */
export class QueryError extends Error {
  public readonly collectionName: string
  public readonly selector: unknown
  public readonly options: unknown
  public readonly attempts: number

  constructor(
    collectionName: string,
    selector: unknown,
    options: unknown,
    attempts: number,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`Query on "${collectionName}" failed after ${attempts} attempt(s): ${reason}`)
    this.name = 'QueryError'
    this.collectionName = collectionName
    this.selector = selector
    this.options = options
    this.attempts = attempts
    this.cause = cause
  }
}

/**
 * Turns the item states a write produced into the upsert/delete split a query update needs.
 *
 * The two lists are not symmetric: an item that is still there after the write is described by its
 * new state, while an item that is gone — removed, or given a new id — is described by the id it
 * used to have and nothing else. Mixing the states from before and after a write into one list
 * loses exactly that distinction.
 * @template T - The type of the items.
 * @param previousItems - The items as they were before the write.
 * @param modifiedItems - The items as they are after it.
 * @returns The changeset describing the write.
 */
function toChangeset<T extends BaseItem>(
  previousItems: T[],
  modifiedItems: T[],
): QueryChangeset<T> {
  const modifiedIds = new Set(modifiedItems.map(item => item.id))
  return {
    upserts: modifiedItems,
    deletes: previousItems
      .map(item => item.id)
      .filter(id => !modifiedIds.has(id)),
  }
}

const DEFAULT_RETRY_ATTEMPTS = 3
const defaultRetryDelay = (attempt: number) => 100 * (4 ** (attempt - 1))
const wait = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms)
})

type QueryState = 'active' | 'complete' | 'error'

type QueryRecord<T extends BaseItem<I>, I = any> = {
  selector: Selector<T>,
  options?: QueryOptions<T>,
  state: QueryState,
  error: Error | null,
  items: T[],
  // Whether the query has been answered at least once. Until it has, `items` is a placeholder
  // rather than a result, and there is nothing to bring up to date incrementally.
  answered?: boolean,
  // Lazily built from `items`, dropped along with them. Deciding whether a write affects a query is
  // a question about ids; answering it by scanning the result would make every write cost the size
  // of every active query's result.
  itemIds?: Set<any>,
  listeners: Set<StateChangeCallback<any>>,
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
  private retryAttempts: number
  private retryDelay: (attempt: number) => number

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
    this.retryAttempts = Math.max(1, options.retry?.attempts ?? DEFAULT_RETRY_ATTEMPTS)
    this.retryDelay = options.retry?.delay ?? defaultRetryDelay
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

    const retryQuery = (selector: Selector<T>, options?: QueryOptions<T>) => {
      const qid = queryId(selector, options)
      const rec = this.queries.get(collection.name)?.get(qid)
      if (!rec) return
      this.publishState(collection.name, qid, 'active', null)
      void this.runQuery(collection.name, selector, options)
    }

    const onQueryStateChange = (
      selector: Selector<T>,
      options: QueryOptions<T> | undefined,
      callback: StateChangeCallback<T>,
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
      // A query that has already failed would otherwise stay failed forever:
      // `registerQuery` only runs for the *first* cursor on a selector, so
      // every later observer inherited the dead state without anything ever
      // retrying it. A new observer is a natural moment to try again.
      if (registry.get(qid)?.state === 'error') retryQuery(selector, options)
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
      retryQuery,
      getQueryState,
      getQueryError,
      getQueryResult,
      onQueryStateChange,
      executeQuery: async (selector, options) => {
        await ready
        return this.executeQuery(collection.name, selector, options)
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

    await storage.setup()
    await Promise.all(indices.map(index => storage.createIndex(index)))
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
    await this.runQuery<T, I>(collectionName, selector, options)
  }

  /**
   * Executes a query, retrying transient failures before giving up. The state
   * stays `'active'` across retries — consumers should see "still loading",
   * not "failed", until we actually stop trying. Only the final failure is
   * published as `'error'` and reported through `onError`; previously that
   * error was swallowed entirely (`fulfillQuery` caught it internally, so the
   * `.catch(this.onError)` on its call site was unreachable) and the query
   * stayed dead for the rest of the session.
   * @param collectionName - name of the collection
   * @param selector - query selector
   * @param options - query options
   */
  private async runQuery<T extends BaseItem<I>, I = any>(
    collectionName: string,
    selector: Selector<T>,
    options?: QueryOptions<T>,
  ) {
    const qid = queryId(selector, options)
    let lastError: unknown
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      // The query can be unregistered while a retry is waiting — dropping out
      // here keeps a disposed cursor from resurrecting its record.
      if (!this.queries.get(collectionName)?.has(qid)) return
      try {
        const items = await this.executeQuery<T, I>(collectionName, selector, options)
        const rec = this.queries.get(collectionName)?.get(qid)
        // A query answered for the first time has no previous result to be relative to; whoever is
        // waiting on it holds nothing yet and needs the whole thing.
        const delta = rec?.answered
          ? diffQueryResults(rec.items as T[], items)
          : undefined
        this.publishResult(collectionName, qid, items)
        this.publishState(collectionName, qid, 'complete', null, delta)
        return
      } catch (error) {
        lastError = error
        if (attempt < this.retryAttempts) await wait(this.retryDelay(attempt))
      }
    }

    const queryError = new QueryError(
      collectionName,
      selector,
      options,
      this.retryAttempts,
      lastError,
    )
    this.publishState(collectionName, qid, 'error', queryError)
    this.onError(queryError)
  }

  /**
   * Notify listeners about state changes and keep the cache updated
   * @param collectionName - name of the collection
   * @param qid - query id
   * @param state - new state
   * @param error - error if state is 'error', null otherwise
   * @param delta - what changed about the result, when that is known
   */
  private publishState(
    collectionName: string,
    qid: string,
    state: QueryState,
    error: Error | null,
    delta?: QueryDelta<any>,
  ) {
    const rec = this.queries.get(collectionName)?.get(qid)
    if (!rec) return
    rec.state = state
    rec.error = error
    // Notify over a snapshot, never the live set: a subscriber is free to
    // resubscribe from inside its own callback — a reactive scope that reads
    // the query state does exactly that when it re-runs — and `Set` iteration
    // visits entries added while it is still running, so notifying in place
    // turns one state change into an unbounded loop.
    const subscribers = [...rec.listeners]
    for (const callback of subscribers) {
      try {
        callWithDelta(callback, state, delta)
      } catch (error_) {
        this.onError(error_ as Error)
      }
    }
  }

  private publishResult<T>(collectionName: string, qid: string, items: T[]) {
    const rec = this.queries.get(collectionName)?.get(qid)
    if (!rec) return
    rec.items = items as any[]
    rec.itemIds = undefined
    rec.answered = true
  }

  private queryItemIds(rec: QueryRecord<any>): Set<any> {
    if (!rec.itemIds) rec.itemIds = new Set(rec.items.map(item => item.id))
    return rec.itemIds
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
      indices.map(field => storageIndexQuery<T, I>(storageAdapter, field)),
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

    return projectItems(limited, fields)
  }

  /**
   * After mutations, bring every affected active query up to date.
   *
   * A query whose previous result is enough to answer the change is brought up to date from that
   * result alone — no round trip to the storage, and no detour through `'active'`, because there is
   * no window in which the query is stale. Only a query the change cannot be reasoned about
   * locally — a window onto a larger set, or one that has never been answered — goes back to the
   * store, and that one gets the same retry and reporting behaviour a freshly registered query
   * gets: a refresh that fails silently leaves exactly the same dead cursor.
   * @param collectionName - name of the collection
   * @param changes - the items the write created, updated or removed
   */
  private async checkQueryUpdates<T extends BaseItem<I>, I = any>(
    collectionName: string,
    changes: QueryChangeset<T>,
  ) {
    const registry = this.queries.get(collectionName)
    if (!registry) throw new Error(`Collection ${collectionName} not initialized!`)
    if (registry.size === 0) return
    if (changes.upserts.length === 0 && changes.deletes.length === 0) return

    // A query is affected when the write produces something it should hold, or takes away
    // something it already holds. The second half is what the written items cannot tell us on
    // their own: an item that no longer matches, or that is gone, is invisible to the matcher.
    const affected = [...registry.values()].filter((rec) => {
      const ids = this.queryItemIds(rec)
      if (changes.deletes.some(id => ids.has(id))) return true
      return changes.upserts.some(item => ids.has(item.id) || match(item, rec.selector))
    })
    if (affected.length === 0) return

    const needsReExecution: QueryRecord<any>[] = []
    for (const rec of affected) {
      const { selector, options } = rec
      const incremental = rec.answered
        ? incrementalQueryUpdate(rec.items as T[], selector, options, changes)
        : null
      if (incremental == null) {
        needsReExecution.push(rec)
        continue
      }
      const qid = queryId(selector, options)
      const delta = diffQueryResults(rec.items as T[], incremental)
      if (isEmptyQueryDelta(delta)) continue
      this.publishResult(collectionName, qid, incremental)
      this.publishState(collectionName, qid, 'complete', null, delta)
    }

    for (const { selector, options } of needsReExecution) {
      this.publishState(collectionName, queryId(selector, options), 'active', null)
    }
    await Promise.all(needsReExecution.map(({ selector, options }) =>
      this.runQuery<T, I>(collectionName, selector, options)))
  }

  private async insert<T extends BaseItem<I>, I = any>(
    collectionName: string,
    newItem: T,
  ): Promise<T> {
    const storage = this.storageAdapters.get(collectionName)
    if (!storage) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const existingItems = await storage.readIds([newItem.id])
    if (existingItems.length > 0) throw new Error(`Item with id ${String(newItem.id)} already exists`)

    await storage.insert([newItem])
    await this.checkQueryUpdates(collectionName, { upserts: [newItem], deletes: [] })
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
      const existing = await storage.readIds([modified.id])
      if (existing.length > 0) throw new Error(`Item with id ${String(modified.id)} already exists`)
    }

    await storage.replace([modified])
    await this.checkQueryUpdates(collectionName, toChangeset([item], [modified]))
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
        const existing = await storage.readIds([modified.id])
        if (existing.length > 0) throw new Error(`Item with id ${String(modified.id)} already exists`)
      }
      return modified
    }))
    await storage.replace(changed)
    await this.checkQueryUpdates(collectionName, toChangeset(items, changed))
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
      const existing = await storage.readIds([modified.id])
      if (existing.length > 0) throw new Error(`Item with id ${String(modified.id)} already exists`)
    }

    await storage.replace([modified])
    await this.checkQueryUpdates(collectionName, toChangeset([item], [modified]))
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
    await this.checkQueryUpdates(collectionName, { upserts: [], deletes: [item.id] })
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
    await this.checkQueryUpdates(collectionName, {
      upserts: [],
      deletes: items.map(item => item.id),
    })
    return items
  }
}
