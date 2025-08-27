import type { BaseItem } from './Collection'
import type { QueryOptions } from './DataAdapter'
import type { LowLevelIndexProvider } from './types/IndexProvider'
import type IndexProvider from './types/IndexProvider'
import type Modifier from './types/Modifier'
import type PersistenceAdapter from './types/PersistenceAdapter'
import type Selector from './types/Selector'
import deepClone from './utils/deepClone'
import match from './utils/match'
import modify from './utils/modify'
import queryId from './utils/queryId'

interface WorkerContext {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => any) => void,
  postMessage: (message: any) => void,
}

interface WorkerDataAdapterHostOptions {
  id?: string,
  storage: (name: string) => PersistenceAdapter<any, any>, // TODO: instroduce new storage adapter
  onError?: (error: Error) => void,
}

type CollectionMethods<T extends BaseItem<I>, I = any> = {
  registerCollection: (
    collectionName: string,
    indices: (IndexProvider<T, I> | LowLevelIndexProvider<T, I>)[],
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
  private persistenceAdapters: Map<string, PersistenceAdapter<any, any>> = new Map()
  private persistenceAdapterReady: Map<string, Promise<void>> = new Map()
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

  private ensurePersistenceAdapter(name: string) {
    if (this.persistenceAdapters.has(name)) return // already created
    const adapter = this.options.storage(name)
    if (!adapter) return // no adapter returned
    this.persistenceAdapters.set(name, adapter)
  }

  private async checkQueryUpdates(
    collectionName: string,
    items: T[],
    getAllItems: () => Promise<T[]>,
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

    const allItems = await getAllItems()
    affectedQueries.forEach(({ selector, options }) => {
      const queryItems = allItems.filter(item => match(item, selector))
      this.emitQueryUpdate(
        collectionName,
        selector,
        options,
        'complete',
        null,
        queryItems,
      )
    })
  }

  protected registerCollection: CollectionMethods<T, I>['registerCollection'] = async (collectionName) => {
    this.queries.set(collectionName, new Map())
    // TODO: what to do with indices?
    this.ensurePersistenceAdapter(collectionName)
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)

    this.persistenceAdapterReady.set(collectionName, persistenceAdapter.register(async (data) => {
      const allChangedItems: T[] = !data || data.items
        // eslint-disable-next-line unicorn/no-await-expression-member
        ? data?.items ?? (await persistenceAdapter.load()).items ?? []
        : [
          ...(data.changes.added ?? []),
          ...(data.changes.modified ?? []),
          ...(data.changes.removed ?? []),
        ]
      await this.checkQueryUpdates(collectionName, allChangedItems, async () => !data || data.items
        ? allChangedItems
        // eslint-disable-next-line unicorn/no-await-expression-member
        : (await persistenceAdapter.load()).items as T[] ?? [])
    }))
  }

  protected unregisterCollection: CollectionMethods<T, I>['unregisterCollection'] = async (collectionName) => {
    this.persistenceAdapters.delete(collectionName)
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
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const allItems = await persistenceAdapter.load()

    if (allItems.items?.some(i => i.id === newItem.id)) {
      throw new Error(`Item with id ${newItem.id as string} already exists`)
    }

    await this.checkQueryUpdates(collectionName, [newItem], () =>
      Promise.resolve([...(allItems.items ?? []), newItem]))

    await persistenceAdapter.save([...(allItems.items ?? []), newItem], {
      added: [newItem],
      modified: [],
      removed: [],
    })

    return newItem
  }

  protected updateOne: CollectionMethods<T, I>['updateOne'] = async (collectionName, selector, modifier) => {
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const loadResponse = await persistenceAdapter.load()
    const allItems = loadResponse.items ? loadResponse.items as T[] : []

    const { $setOnInsert, ...restModifier } = modifier
    const index = allItems.findIndex(i => match(i, selector))
    const item = index == null || index === -1 ? null : allItems[index] as T | null
    if (item == null) return [] // no item found, nothing to update

    const modifiedItem = modify(deepClone(item), restModifier)
    const hasItemWithSameId = item.id !== modifiedItem.id
      && allItems.some(i => i.id === modifiedItem.id)
    if (hasItemWithSameId) {
      throw new Error(`Item with id ${modifiedItem.id as string} already exists`)
    }

    allItems.splice(index, 1, modifiedItem)
    await this.checkQueryUpdates(collectionName, [modifiedItem], () =>
      Promise.resolve(allItems))
    await persistenceAdapter.save(allItems, {
      added: [],
      modified: [modifiedItem],
      removed: [],
    })
    return [modifiedItem]
  }

  protected updateMany: CollectionMethods<T, I>['updateMany'] = async (collectionName, selector, modifier) => {
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const loadResponse = await persistenceAdapter.load()
    // TODO: we have to find a solution and avoid loading all items here and also in the other methods
    const allItems = loadResponse.items ? loadResponse.items as T[] : []

    const { $setOnInsert, ...restModifier } = modifier
    const items = allItems.filter(i => match(i, selector))
    if (items.length === 0) return [] // no items found, nothing to update

    const changes = items.map((item) => {
      const index = allItems.findIndex(i => i.id === item.id)
      if (index === -1) throw new Error(`Cannot resolve index for item with id '${item.id as string}'`)
      const modifiedItem = modify(deepClone(item), restModifier)
      const hasItemWithSameId = item.id !== modifiedItem.id
        && allItems.some(i => i.id === modifiedItem.id)
      if (hasItemWithSameId) {
        throw new Error(`Item with id '${modifiedItem.id as string}' already exists`)
      }

      return {
        item: modifiedItem,
        index,
      }
    })

    changes.forEach(({ item, index }) => {
      allItems.splice(index, 1, item)
    })
    const changedItems = changes.map(({ item }) => item)
    await this.checkQueryUpdates(collectionName, changedItems, () =>
      Promise.resolve(allItems))
    await persistenceAdapter.save(allItems, {
      added: [],
      modified: changedItems,
      removed: [],
    })
    return changedItems
  }

  protected replaceOne: CollectionMethods<T, I>['replaceOne'] = async (collectionName, selector, replacement) => {
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const loadResponse = await persistenceAdapter.load()
    const allItems = loadResponse.items ? loadResponse.items as T[] : []

    const index = allItems.findIndex(i => match(i, selector))
    const item = index == null || index === -1 ? null : allItems[index] as T | null
    if (item == null) return [] // no item found, nothing to update

    const hasItemWithSameId = item.id !== replacement.id
      && replacement.id != null
      && allItems.some(i => i.id === replacement.id)
    if (hasItemWithSameId) {
      throw new Error(`Item with id ${replacement.id as string} already exists`)
    }

    const modifiedItem = {
      ...replacement,
      id: replacement.id ?? item.id,
    } as T

    allItems.splice(index, 1, modifiedItem)
    await this.checkQueryUpdates(collectionName, [modifiedItem], () =>
      Promise.resolve(allItems))
    await persistenceAdapter.save(allItems, {
      added: [],
      modified: [modifiedItem],
      removed: [],
    })
    return [modifiedItem]
  }

  protected removeOne: CollectionMethods<T, I>['removeOne'] = async (collectionName, selector) => {
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const loadResponse = await persistenceAdapter.load()
    const allItems = loadResponse.items ? loadResponse.items as T[] : []

    const index = allItems.findIndex(i => match(i, selector))
    const item = index == null || index === -1 ? null : allItems[index] as T | null
    if (item == null) {
      return [] // no item found, nothing to remove
    }

    allItems.splice(index, 1)
    await this.checkQueryUpdates(collectionName, [item], () =>
      Promise.resolve(allItems))
    await persistenceAdapter.save(allItems, {
      added: [],
      modified: [],
      removed: [item],
    })
    return [item]
  }

  protected removeMany: CollectionMethods<T, I>['removeMany'] = async (collectionName, selector) => {
    const persistenceAdapter = this.persistenceAdapters.get(collectionName)
    if (!persistenceAdapter) throw new Error(`No persistence adapter for collection ${collectionName}`)
    const loadResponse = await persistenceAdapter.load()
    const allItems = loadResponse.items ? loadResponse.items as T[] : []

    const items = allItems.filter(i => match(i, selector))
    if (items.length === 0) {
      return [] // no items found, nothing to remove
    }

    items.forEach((item) => {
      const index = allItems.findIndex(i => i.id === item.id)
      if (index === -1) throw new Error(`Cannot resolve index for item with id '${item.id as string}'`)
      allItems.splice(index, 1)
    })

    await this.checkQueryUpdates(collectionName, items, () =>
      Promise.resolve(allItems))
    await persistenceAdapter.save(allItems, {
      added: [],
      modified: [],
      removed: items,
    })
    return items
  }

  protected isReady: CollectionMethods<T, I>['isReady'] = async (collectionName) => {
    return this.persistenceAdapterReady.get(collectionName)
  }
}
