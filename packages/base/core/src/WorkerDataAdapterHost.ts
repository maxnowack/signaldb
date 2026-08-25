import type { BaseItem } from './Collection'
import type { QueryOptions } from './DataAdapter'
import type Modifier from './types/Modifier'
import type StorageAdapter from './types/StorageAdapter'
import type Selector from './types/Selector'
import deepClone from './utils/deepClone'
import match from './utils/match'
import modify from './utils/modify'
import queryId from './utils/queryId'
import isEqual from './utils/isEqual'
import getIndexInfo from './getIndexInfo'
import idIndexQuery from './utils/idIndexQuery'
import storageIndexQuery from './utils/storageIndexQuery'
import type { FlatSelector } from './types/Selector'
import sortItems from './utils/sortItems'
import projectItems from './utils/projectItems'
import compact from './utils/compact'
import incrementalQueryUpdate from './utils/incrementalQueryUpdate'
import type { QueryChangeset } from './utils/incrementalQueryUpdate'
import { diffQueryResults, isEmptyQueryDelta } from './utils/queryDelta'
import type { QueryDelta } from './utils/queryDelta'

export interface WorkerDataAdapterHostEndpoint {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => any) => void,
  postMessage: (message: any) => void,
}

interface WorkerDataAdapterHostOptions {
  id?: string,
  storage: (name: string) => StorageAdapter<any, any>,
  onError?: (error: Error) => void,
  log?: (message: string, ...args: any[]) => void,
}

type CollectionMethods<T extends BaseItem<I>, I = any> = {
  registerCollection: (
    collectionName: string,
    indices: string[],
  ) => Promise<void>,
  unregisterCollection: (
    collectionName: string,
  ) => Promise<void>,
  registerQuery: <O extends QueryOptions<T>>(
    collectionName: string,
    selector: Selector<T>,
    options?: O,
  ) => Promise<void>,
  unregisterQuery: <O extends QueryOptions<T>>(
    collectionName: string,
    selector: Selector<T>,
    options?: O,
  ) => Promise<void>,
  executeQuery: <O extends QueryOptions<T>>(
    collectionName: string,
    selector: Selector<T>,
    options?: O,
  ) => Promise<T[]>,
  insert: (
    collectionName: string,
    items: [T][],
  ) => Promise<(T | Error)[]>,
  updateOne: (
    collectionName: string,
    args: [Selector<T>, Modifier<T>][],
  ) => Promise<(T[] | Error)[]>,
  updateMany: (
    collectionName: string,
    args: [Selector<T>, Modifier<T>][],
  ) => Promise<(T[] | Error)[]>,
  replaceOne: (
    collectionName: string,
    args: [Selector<T>, Omit<T, 'id'> & Partial<Pick<T, 'id'>>][],
  ) => Promise<(T[] | Error)[]>,
  removeOne: (
    collectionName: string,
    selectors: [Selector<T>][],
  ) => Promise<(T[] | Error)[]>,
  removeMany: (
    collectionName: string,
    selectors: [Selector<T>][],
  ) => Promise<(T[] | Error)[]>,
  isReady: (
    collectionName: string,
  ) => Promise<void>,
}

/**
 * Turns the item states a write produced into the upsert/delete split a query update needs.
 *
 * The two lists are not symmetric: an item that is still there after the write is described by
 * its new state, while an item that is gone — removed, or given a new id — is described by the id
 * it used to have and nothing else. Mixing the states from before and after a write into one list
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

export default class WorkerDataAdapterHost<
  T extends BaseItem<I>,
  I = any,
> {
  private id: string
  private log: (message: string, ...args: any[]) => void = () => {}
  private storageAdapters: Map<string, StorageAdapter<any, any>> = new Map()
  private storageAdapterReady: Map<string, Promise<void>> = new Map()
  private collectionIndices: Map<string, string[]> = new Map()
  private queries: Map<string, Map<string, {
    selector: Selector<any>,
    options?: QueryOptions<any>,
    // The result this host last sent out, and the reference every delta it sends afterwards is
    // relative to. `null` until the query has been answered once, because the first answer has
    // nothing to be relative to and goes out in full.
    items: BaseItem[] | null,
    // Lazily built from `items`, dropped along with them. Whether a write affects a query is a
    // question about ids, and answering it by scanning the result would cost the size of every
    // active query's result on every write — the very thing sending deltas is here to avoid.
    itemIds?: Set<any>,
  }>> = new Map()

  private onError: (error: Error) => void = (error) => {
    // eslint-disable-next-line no-console
    console.error(error)
  }

  constructor(
    private workerContext: WorkerDataAdapterHostEndpoint,
    private options: WorkerDataAdapterHostOptions,
  ) {
    this.id = this.options.id || 'default-worker-data-adapter'
    if (this.options.onError) {
      this.onError = this.options.onError
    }
    if (this.options.log) this.log = this.options.log

    this.workerContext.addEventListener('message', async (event: MessageEvent) => {
      try {
        const { workerId, id, method, args } = event.data as {
          id: string,
          workerId: string,
          method: keyof CollectionMethods<T, I>,
          args: any[],
        }
        await this.handleMessage(workerId, id, method, args)
      } catch (error) {
        this.onError(error as Error)
      }
    })
    this.respond('ready', null, null, 'ready')
  }

  private respond(id: string, data: any, error: Error | null = null, type: 'response' | 'queryUpdate' | 'ready' = 'response') {
    this.workerContext.postMessage({ id, workerId: this.id, type, data, error })
  }

  private async handleMessage(
    workerId: string,
    id: string,
    method: keyof CollectionMethods<T, I>,
    args: any[],
  ) {
    if (workerId !== this.id) return

    const fn = this[method] as any
    if (typeof fn !== 'function') {
      this.respond(id, null, new Error(`Method ${method} not found`))
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.log(method, ...args)

    // wait for the storage adapter to be ready
    await this.isReady(args[0] as string)
    try {
      const result = await fn.apply(this, args)
      this.respond(id, result)
    } catch (error) {
      this.respond(id, null, error as Error)
    }
  }

  private async getIndexInfo(
    collectionName: string,
    selector: Selector<T>,
  ) {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    // `id` needs no declared index: `readIds` is exactly the lookup it
    // describes, so every inclusive form of it is answered here rather than by
    // reading the whole collection (utils/idIndexQuery.ts).
    if (selector != null && Object.keys(selector).length === 1 && 'id' in selector) {
      const idResult = idIndexQuery<T, I>(selector as FlatSelector<T>)
      if (idResult.matched) {
        return {
          matched: true,
          ids: compact(idResult.ids),
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

    const indices = this.collectionIndices.get(collectionName) ?? []
    // `id` first, and always present: it needs no declared index, because
    // `readIds` is exactly the lookup it describes (utils/idIndexQuery.ts).
    return getIndexInfo(
      indices.map(field => storageIndexQuery<T, I>(storageAdapter, field)),
      selector,
    )
  }

  private async queryItems(
    collectionName: string,
    selector: Selector<T>,
  ): Promise<T[]> {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const indexInfo = await this.getIndexInfo(collectionName, selector)
    const matchItems = (item: T) => {
      if (indexInfo.optimizedSelector == null) return true // if no selector is given, return all items
      if (Object.keys(indexInfo.optimizedSelector).length <= 0) return true // if selector is empty, return all items
      const matches = match(item, indexInfo.optimizedSelector)
      return matches
    }
    if (indexInfo.matched) {
      const items = await storageAdapter.readIds(indexInfo.ids)
      if (isEqual(indexInfo.optimizedSelector, {})) return items
      return items.filter(matchItems)
    } else {
      const allItems = await storageAdapter.readAll()
      if (isEqual(selector, {})) return allItems
      return allItems.filter(matchItems)
    }
  }

  private async executeQuery(
    collectionName: string,
    selector: Selector<T>,
    options?: QueryOptions<T>,
  ): Promise<T[]> {
    // null selector means no matches
    if (selector === null) return []

    const items = await this.queryItems(collectionName, selector || {})
    const { sort, skip, limit, fields } = options || {}
    const sorted = sort ? sortItems(items, sort) : items
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped
    return projectItems(limited, fields)
  }

  private ensureQuery(
    collectionName: string,
    selector: Selector<any>,
    options?: QueryOptions<any>,
  ) {
    const id = queryId(selector, options)
    if (!this.queries.get(collectionName)) {
      throw new Error(`Collection ${collectionName} not initialized!`)
    }
    let query = this.queries.get(collectionName)?.get(id)
    if (!query) {
      query = { selector, options, items: null }
      this.queries.get(collectionName)?.set(id, query)
    }
    return query
  }

  private setQueryItems(
    query: { items: BaseItem[] | null, itemIds?: Set<any> },
    items: BaseItem[] | null,
  ) {
    query.items = items
    query.itemIds = undefined
  }

  private queryItemIds(query: { items: BaseItem[] | null, itemIds?: Set<any> }): Set<any> {
    if (!query.itemIds) query.itemIds = new Set((query.items ?? []).map(item => item.id))
    return query.itemIds
  }

  private emitQueryUpdate(
    collectionName: string,
    selector: Selector<any>,
    options: QueryOptions<any> | undefined,
    state: 'active' | 'complete' | 'error',
    error: Error | null,
    items?: BaseItem[],
    delta?: QueryDelta<any>,
  ) {
    const id = queryId(selector, options)
    const collectionQueries = this.queries.get(collectionName)
    if (!collectionQueries) throw new Error(`Collection ${collectionName} not initialized!`)

    // `qid` is what the adapter routes on. It is derived from the same selector/options pair the
    // adapter registered the query with, so sending it saves every recipient from re-deriving it.
    //
    // `items` and `delta` are alternatives: the first answer to a query carries the whole result
    // because the recipient holds nothing yet, every answer after it carries only what changed.
    // Everything in this message is structurally cloned on its way out of the worker, which is why
    // it matters that editing one field of one row no longer costs a copy of the entire result.
    this.respond(
      id,
      { collectionName, qid: id, selector, options, state, error, items, delta },
      null,
      'queryUpdate',
    )
  }

  private ensureStorageAdapter(name: string) {
    if (this.storageAdapters.has(name)) return // already created
    const adapter = this.options.storage(name)
    if (!adapter) return // no adapter returned
    this.storageAdapters.set(name, adapter)
  }

  private async checkQueryUpdates(
    collectionName: string,
    changes: QueryChangeset<T>,
  ) {
    const queries = this.queries.get(collectionName)
    if (!queries) throw new Error(`Collection ${collectionName} not initialized!`)
    if (changes.upserts.length === 0 && changes.deletes.length === 0) return

    // A query is affected when the write produces something it should hold, or takes away
    // something it already holds. The second half is what the write itself cannot tell us: an
    // item that no longer matches, or that was removed outright, is invisible to the matcher.
    const affectedQueries = [...queries.values()].filter((query) => {
      const ids = this.queryItemIds(query)
      if (changes.deletes.some(id => ids.has(id))) return true
      return changes.upserts.some(item => ids.has(item.id) || match(item, query.selector))
    })
    if (affectedQueries.length === 0) return // no active queries affected

    await Promise.all(affectedQueries.map(async (query) => {
      const { selector, options } = query
      const previous = query.items
      const incremental = previous == null
        ? null
        : incrementalQueryUpdate(previous, selector, options, changes)

      if (incremental != null) {
        // Answered from the previous result, without touching the store — so there is no window in
        // which the query is stale, and nothing to announce with an `'active'` state either.
        const delta = diffQueryResults(previous as T[], incremental)
        if (isEmptyQueryDelta(delta)) return
        this.setQueryItems(query, incremental)
        this.emitQueryUpdate(
          collectionName, selector, options, 'complete', null, undefined, delta,
        )
        return
      }

      this.emitQueryUpdate(collectionName, selector, options, 'active', null)
      const queryItems = await this.executeQuery(collectionName, selector, options)
      if (previous == null) {
        this.setQueryItems(query, queryItems)
        this.emitQueryUpdate(collectionName, selector, options, 'complete', null, queryItems)
        return
      }
      const delta = diffQueryResults(previous as T[], queryItems)
      this.setQueryItems(query, queryItems)
      this.emitQueryUpdate(
        collectionName, selector, options, 'complete', null, undefined, delta,
      )
    }))
  }

  protected registerCollection: CollectionMethods<T, I>['registerCollection'] = async (collectionName, indices) => {
    this.collectionIndices.set(collectionName, indices)
    this.queries.set(collectionName, new Map())
    this.ensureStorageAdapter(collectionName)
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const setupPromise = (async () => {
      await storageAdapter.setup()
      await Promise.all(indices.map(index => storageAdapter.createIndex(index)))
    })()

    this.storageAdapterReady.set(collectionName, setupPromise)
    await setupPromise
  }

  protected unregisterCollection: CollectionMethods<T, I>['unregisterCollection'] = async (collectionName) => {
    this.storageAdapters.delete(collectionName)
    this.queries.delete(collectionName)
  }

  protected registerQuery: CollectionMethods<T, I>['registerQuery'] = async (collectionName, selector, options) => {
    const query = this.ensureQuery(collectionName, selector, options)
    const queryItems = await this.executeQuery(collectionName, selector, options)
    // Always the full result, even for a query that is already registered: whoever is registering
    // holds nothing for it yet, and a delta would be relative to a result only the host has seen.
    this.setQueryItems(query, queryItems)
    this.emitQueryUpdate(
      collectionName,
      selector,
      options,
      'complete',
      null,
      queryItems,
    )
  }

  protected unregisterQuery: CollectionMethods<T, I>['unregisterQuery'] = async (collectionName, selector, options) => {
    const id = queryId(selector, options)
    if (!this.queries.get(collectionName)) throw new Error(`Collection ${collectionName} not initialized!`)
    this.queries.get(collectionName)?.delete(id)
  }

  protected insert: CollectionMethods<T, I>['insert'] = async (collectionName, input) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const existingItems = await this.executeQuery(
      collectionName,
      { id: { $in: input.map(i => i[0].id) } } as Selector<any>,
    )
    const result = input.map(([item]) => {
      if (item.id == null) return new Error('Item must have an id')
      if (existingItems.some(existing => existing.id === item.id)) {
        return new Error(`Item with id ${item.id as string} already exists`)
      }
      return item
    })

    const newItems = result.filter(item => !(item instanceof Error)) as T[]
    await storageAdapter.insert(newItems)
    await this.checkQueryUpdates(collectionName, { upserts: newItems, deletes: [] })

    return result
  }

  protected updateOne: CollectionMethods<T, I>['updateOne'] = async (collectionName, parameters) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const previousItems: T[] = []
    const result = await Promise.all(parameters.map(async ([selector, modifier]) => {
      const item = await this.executeQuery(
        collectionName,
        selector,
        { limit: 1 },
      ).then(items => items[0] ?? null)

      const { $setOnInsert, ...restModifier } = modifier
      if (item == null) return []

      previousItems.push(item)
      const modifiedItem = modify(deepClone(item), restModifier)
      if (item.id !== modifiedItem.id) {
        const existingItems = await this.executeQuery(
          collectionName,
          { id: modifiedItem.id } as Selector<T>,
          { limit: 1 },
        )
        if (existingItems.length > 0) {
          return new Error(`Item with id ${modifiedItem.id as string} already exists`)
        }
      }
      return [modifiedItem]
    }))

    const modifiedItems = compact(result.filter(item => !(item instanceof Error)).flat()) as T[]
    if (modifiedItems.length > 0) {
      await storageAdapter.replace(modifiedItems)
      await this.checkQueryUpdates(collectionName, toChangeset(previousItems, modifiedItems))
    }
    return result
  }

  protected updateMany: CollectionMethods<T, I>['updateMany'] = async (collectionName, parameters) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const previousItems: T[] = []
    const result = await Promise.all(parameters.map(async ([selector, modifier]) => {
      const items = await this.executeQuery(
        collectionName,
        selector,
      )
      if (items.length === 0) return [] // no items found, nothing to update

      const { $setOnInsert, ...restModifier } = modifier

      try {
        const changedItems = await Promise.all(items.map(async (item) => {
          const modifiedItem = modify(deepClone(item), restModifier)
          if (item.id !== modifiedItem.id) {
            const existingItems = await this.executeQuery(
              collectionName,
              { id: modifiedItem.id } as Selector<T>,
              { limit: 1 },
            )
            if (existingItems.length > 0) {
              throw new Error(`Item with id ${modifiedItem.id as string} already exists`)
            }
          }

          previousItems.push(item)
          return modifiedItem
        }))
        return changedItems
      } catch (error) {
        return error as Error
      }
    }))

    const modifiedItems = compact(result.filter(item => !(item instanceof Error)).flat()) as T[]
    if (modifiedItems.length > 0) {
      await storageAdapter.replace(modifiedItems)
      await this.checkQueryUpdates(collectionName, toChangeset(previousItems, modifiedItems))
    }
    return result
  }

  protected replaceOne: CollectionMethods<T, I>['replaceOne'] = async (collectionName, parameters) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const previousItems: T[] = []
    const result = await Promise.all(parameters.map(async ([
      selector,
      replacement,
    ]) => {
      const item = await this.executeQuery(
        collectionName,
        selector,
        { limit: 1 },
      ).then(items => items[0] ?? null)
      if (item == null) return [] // no item found, nothing to update

      previousItems.push(item)
      const modifiedItem = {
        ...replacement,
        id: replacement.id ?? item.id,
      } as T

      if (item.id !== modifiedItem.id) {
        const existingItems = await this.executeQuery(
          collectionName,
          { id: modifiedItem.id } as Selector<T>,
          { limit: 1 },
        )
        if (existingItems.length > 0) {
          return new Error(`Item with id ${modifiedItem.id as string} already exists`)
        }
      }
      return [modifiedItem]
    }))

    const modifiedItems = compact(result.filter(item => !(item instanceof Error)).flat()) as T[]
    if (modifiedItems.length > 0) {
      await storageAdapter.replace(modifiedItems)
      await this.checkQueryUpdates(collectionName, toChangeset(previousItems, modifiedItems))
    }
    return result
  }

  protected removeOne: CollectionMethods<T, I>['removeOne'] = async (collectionName, selectors) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const result = await Promise.all(selectors.map(async ([selector]) => {
      const item = await this.executeQuery(
        collectionName,
        selector,
        { limit: 1 },
      ).then(items => items[0] ?? null)
      if (item == null) return [] // no item found, nothing to remove
      return [item]
    }))

    const items = result.flat()
    if (items.length > 0) {
      await storageAdapter.remove(items)
      await this.checkQueryUpdates(collectionName, {
        upserts: [],
        deletes: items.map(item => item.id),
      })
    }
    return result
  }

  protected removeMany: CollectionMethods<T, I>['removeMany'] = async (collectionName, selectors) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const result = await Promise.all(selectors.map(async ([selector]) => this.executeQuery(
      collectionName,
      selector,
    )))

    const items = result.flat()
    if (items.length > 0) {
      await storageAdapter.remove(items)
      await this.checkQueryUpdates(collectionName, {
        upserts: [],
        deletes: items.map(item => item.id),
      })
    }
    return result
  }

  protected isReady: CollectionMethods<T, I>['isReady'] = async (collectionName) => {
    return this.storageAdapterReady.get(collectionName)
  }
}
