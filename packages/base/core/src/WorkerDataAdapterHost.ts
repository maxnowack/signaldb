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
import getIndexInfo from './Collection/getIndexInfo'
import getMatchingKeys from './utils/getMatchingKeys'
import type { FlatSelector } from './types/Selector'
import sortItems from './utils/sortItems'
import project from './utils/project'

interface WorkerContext {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => any) => void,
  postMessage: (message: any) => void,
}

interface WorkerDataAdapterHostOptions {
  id?: string,
  storage: (name: string) => StorageAdapter<any, any>, // TODO: instroduce new storage adapter
  onError?: (error: Error) => void,
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
  insert: (
    collectionName: string,
    item: T,
  ) => Promise<T>,
  updateOne: (
    collectionName: string,
    selector: Selector<T>,
    modifier: Modifier<T>,
  ) => Promise<T[]>,
  updateMany: (
    collectionName: string,
    selector: Selector<T>,
    modifier: Modifier<T>,
  ) => Promise<T[]>,
  replaceOne: (
    collectionName: string,
    selector: Selector<T>,
    replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>,
  ) => Promise<T[]>,
  removeOne: (
    collectionName: string,
    selector: Selector<T>,
  ) => Promise<T[]>,
  removeMany: (
    collectionName: string,
    selector: Selector<T>,
  ) => Promise<T[]>,
  isReady: (
    collectionName: string,
  ) => Promise<void>,
}

export default class WorkerDataAdapterHost<
  T extends BaseItem<I>,
  I = any,
> {
  private id: string
  private storageAdapters: Map<string, StorageAdapter<any, any>> = new Map()
  private storageAdapterReady: Map<string, Promise<void>> = new Map()
  private collectionIndices: Map<string, string[]> = new Map()
  private queries: Map<string, Map<string, {
    selector: Selector<any>,
    options?: QueryOptions<any>,
  }>> = new Map()

  private onError: (error: Error) => void = (error) => {
    // eslint-disable-next-line no-console
    console.error(error)
  }

  constructor(private workerContext: WorkerContext, private options: WorkerDataAdapterHostOptions) {
    this.id = this.options.id || 'default-worker-data-adapter'
    if (this.options.onError) {
      this.onError = this.options.onError
    }

    if (typeof addEventListener === 'undefined' || typeof postMessage === 'undefined') {
      throw new TypeError('WorkerDataAdapterHost can only be used in a Web Worker context')
    }

    this.workerContext.addEventListener('message', this.handleMessage.bind(this))
  }

  private respond(id: string, data: any, error: Error | null = null, type: 'response' | 'queryUpdate' = 'response') {
    this.workerContext.postMessage({ id, workerId: this.id, type, data, error })
  }

  private handleMessage(event: MessageEvent) {
    const { workerId, id, method, args } = event.data as {
      id: string,
      workerId: string,
      method: keyof CollectionMethods<T, I>,
      args: any[],
    }
    if (workerId !== this.id) return

    const fn = this[method] as any
    if (typeof fn !== 'function') {
      this.respond(id, null, new Error(`Method ${method} not found`))
      return
    }

    Promise.resolve()
      .then(() => fn.apply(this, args))
      .then((result) => {
        this.respond(id, result)
      })
      .catch((error) => {
        this.respond(id, null, error as Error)
      })
  }

  private async getIndexInfo(
    collectionName: string,
    selector: Selector<T>,
  ) {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    if (selector != null
      && Object.keys(selector).length === 1
      && 'id' in selector
      && typeof selector.id !== 'object') {
      const idIndex = await storageAdapter.readIndex('id')
      return {
        matched: true,
        positions: [...idIndex.get(selector.id) ?? []],
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

    const indices = this.collectionIndices.get(collectionName) ?? []
    return getIndexInfo(indices.map(field => async (flatSelector: FlatSelector<T>) => {
      if (!Object.hasOwnProperty.call(flatSelector, field)) {
        // If the field is not present in the selector, we can't optimize
        return { matched: false }
      }

      const index = await storageAdapter.readIndex(field)

      const fieldSelector = (flatSelector as Record<string, any>)[field]
      const filteresForNull = fieldSelector == null || fieldSelector.$exists === false
      const keys = filteresForNull
        ? { include: null, exclude: [...index.keys()].filter(key => key != null) }
        : getMatchingKeys<T, I>(field, flatSelector)
      if (keys.include == null && keys.exclude == null) return { matched: false }

      // Accumulate included positions
      let includedPositions: number[] = []
      if (keys.include == null) {
        for (const set of index.values()) {
          for (const pos of set) {
            includedPositions.push(pos)
          }
        }
      } else {
        for (const key of keys.include) {
          const posSet = index.get(key)
          if (posSet) {
            for (const pos of posSet) {
              includedPositions.push(pos)
            }
          }
        }
      }

      // If exclusion is specified, build a single set of all positions to exclude.
      if (keys.exclude != null) {
        const excludeSet = new Set<number>()
        for (const key of keys.exclude) {
          const posSet = index.get(key)
          if (posSet) {
            for (const pos of posSet) {
              excludeSet.add(pos)
            }
          }
        }
        // Filter out any position that exists in the exclude set.
        includedPositions = includedPositions.filter(pos => !excludeSet.has(pos))
      }

      return {
        matched: true,
        positions: includedPositions,
        fields: [field],
        keepSelector: filteresForNull,
      }
    }), selector)
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
      const items = await storageAdapter.readPositions(indexInfo.positions)
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
    const items = await this.queryItems(collectionName, selector || {})
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
      query = { selector, options }
      this.queries.get(collectionName)?.set(id, query)
    }
    return query
  }

  private emitQueryUpdate(
    collectionName: string,
    selector: Selector<any>,
    options: QueryOptions<any> | undefined,
    state: 'active' | 'complete' | 'error',
    error: Error | null,
    items?: BaseItem[],
  ) {
    const id = queryId(selector, options)
    const collectionQueries = this.queries.get(collectionName)
    if (!collectionQueries) throw new Error(`Collection ${collectionName} not initialized!`)

    this.respond(id, { collectionName, selector, options, state, error, items }, null, 'queryUpdate')
  }

  private ensureStorageAdapter(name: string) {
    if (this.storageAdapters.has(name)) return // already created
    const adapter = this.options.storage(name)
    if (!adapter) return // no adapter returned
    this.storageAdapters.set(name, adapter)
  }

  private async checkQueryUpdates(
    collectionName: string,
    items: T[],
  ) {
    const queries = this.queries.get(collectionName)
    if (!queries) throw new Error(`Collection ${collectionName} not initialized!`)
    const affectedQueries = queries.values().filter(({ selector }) =>
      items.some(item => match(item, selector))).toArray() ?? []

    if (affectedQueries.length === 0) return // no active queries affected
    affectedQueries.forEach(({ selector, options }) => {
      this.emitQueryUpdate(
        collectionName,
        selector,
        options,
        'active',
        null,
      )
    })

    await Promise.all(affectedQueries.map(async ({ selector, options }) => {
      const queryItems = await this.executeQuery(collectionName, selector, options)
      this.emitQueryUpdate(
        collectionName,
        selector,
        options,
        'complete',
        null,
        queryItems,
      )
    }))
  }

  protected registerCollection: CollectionMethods<T, I>['registerCollection'] = async (collectionName, indices) => {
    this.collectionIndices.set(collectionName, indices)
    this.queries.set(collectionName, new Map())
    // TODO: what to do with indices?
    this.ensureStorageAdapter(collectionName)
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const setupPromise = (async () => {
      await Promise.all([
        storageAdapter.createIndex('id'),
        ...indices.map(index => storageAdapter.createIndex(index)),
      ])
      await storageAdapter.setup()
    })()

    this.storageAdapterReady.set(collectionName, setupPromise)
    await setupPromise
  }

  protected unregisterCollection: CollectionMethods<T, I>['unregisterCollection'] = async (collectionName) => {
    this.storageAdapters.delete(collectionName)
    this.queries.delete(collectionName)
  }

  protected registerQuery: CollectionMethods<T, I>['registerQuery'] = async (collectionName, selector, options) => {
    this.ensureQuery(collectionName, selector, options)
  }

  protected unregisterQuery: CollectionMethods<T, I>['unregisterQuery'] = async (collectionName, selector, options) => {
    const id = queryId(selector, options)
    if (!this.queries.get(collectionName)) throw new Error(`Collection ${collectionName} not initialized!`)
    this.queries.get(collectionName)?.delete(id)
  }

  protected insert: CollectionMethods<T, I>['insert'] = async (collectionName, newItem) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const existingItems = await this.executeQuery(
      collectionName,
      { id: newItem.id } as Selector<T>,
      { limit: 1 },
    )
    if (existingItems.length > 0) {
      throw new Error(`Item with id ${newItem.id as string} already exists`)
    }

    await storageAdapter.insert([newItem])
    await this.checkQueryUpdates(collectionName, [newItem])

    return newItem
  }

  protected updateOne: CollectionMethods<T, I>['updateOne'] = async (collectionName, selector, modifier) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const item = await this.executeQuery(
      collectionName,
      selector,
      { limit: 1 },
    ).then(items => items[0] ?? null)

    const { $setOnInsert, ...restModifier } = modifier
    if (item == null) return [] // no item found, nothing to update

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
    await storageAdapter.replace([modifiedItem])
    await this.checkQueryUpdates(collectionName, [modifiedItem])
    return [modifiedItem]
  }

  protected updateMany: CollectionMethods<T, I>['updateMany'] = async (collectionName, selector, modifier) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const items = await this.executeQuery(
      collectionName,
      selector,
    )
    if (items.length === 0) return [] // no items found, nothing to update

    const { $setOnInsert, ...restModifier } = modifier

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

      return modifiedItem
    }))

    await storageAdapter.replace(changedItems)
    await this.checkQueryUpdates(collectionName, changedItems)
    return changedItems
  }

  protected replaceOne: CollectionMethods<T, I>['replaceOne'] = async (collectionName, selector, replacement) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    const item = await this.executeQuery(
      collectionName,
      selector,
      { limit: 1 },
    ).then(items => items[0] ?? null)
    if (item == null) return [] // no item found, nothing to update

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
        throw new Error(`Item with id ${modifiedItem.id as string} already exists`)
      }
    }

    await storageAdapter.replace([modifiedItem])
    await this.checkQueryUpdates(collectionName, [modifiedItem])
    return [modifiedItem]
  }

  protected removeOne: CollectionMethods<T, I>['removeOne'] = async (collectionName, selector) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const item = await this.executeQuery(
      collectionName,
      selector,
      { limit: 1 },
    ).then(items => items[0] ?? null)
    if (item == null) return [] // no item found, nothing to remove

    await storageAdapter.remove([item])
    await this.checkQueryUpdates(collectionName, [item])
    return [item]
  }

  protected removeMany: CollectionMethods<T, I>['removeMany'] = async (collectionName, selector) => {
    const storageAdapter = this.storageAdapters.get(collectionName)
    if (!storageAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const items = await this.executeQuery(
      collectionName,
      selector,
    )
    if (items.length === 0) return [] // no items found, nothing to remove

    await storageAdapter.remove(items)
    await this.checkQueryUpdates(collectionName, items)
    return items
  }

  protected isReady: CollectionMethods<T, I>['isReady'] = async (collectionName) => {
    return this.storageAdapterReady.get(collectionName)
  }
}
