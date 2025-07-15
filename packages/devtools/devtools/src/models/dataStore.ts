/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import type { FindOptions, Modifier, Selector } from '@signaldb/core'
import { Collection } from '@signaldb/core'
import ItemStore from '../utils/ItemStore'
import settingsStore from './settingsStore'

const dataStore = new ItemStore<{ items: Record<string, any>[] }>()
const collections = dataStore.register('collections', { items: Collection.getCollections() })
const mutations = dataStore.register('mutations', { items: [] })
const queries = dataStore.register('queries', { items: [] })
const measuredTimes = dataStore.register('measuredTimes', { items: [] })

/**
 * Generates a random hexadecimal ID.
 * @returns A random hexadecimal ID.
 */
function randomId() {
  return Math.floor(Math.random() * 1e17).toString(16)
}

const handlerCategories: Record<string, string[]> = {
  '_debug.find': ['queries'],
  '_debug.insert': ['mutations'],
  '_debug.updateOne': ['mutations'],
  '_debug.updateMany': ['mutations'],
  '_debug.removeOne': ['mutations'],
  '_debug.removeMany': ['mutations'],
  '_debug.getItems': ['measuredTimes'],
}

const handlers = {
  '_debug.find': (
    collection: Collection<any>,
    callstack: string,
    selector: Selector<any> | undefined,
    options: FindOptions<any, false> | undefined,
  ) => {
    let newQueries = [...dataStore.getItem('queries')?.items || []]
    // increase the count of the query with same selector and options if it exists
    let exists = false
    newQueries = newQueries.map((query) => {
      if (collection.name === query.collectionName && callstack === query.callstack) {
        exists = true
        return { ...query, count: query.count + 1, lastTime: Date.now() }
      }
      return query
    })
    // add the query if it does not exist
    if (!exists) {
      newQueries.push({
        id: randomId(),
        collectionName: collection.name,
        lastTime: Date.now(),
        count: 1,
        selector,
        options,
        callstack,
      })
    }
    queries.patch({ items: newQueries })
  },
  '_debug.getItems': (collection: Collection<any>, callstack: string, selector: Selector<any> | undefined, measuredTime: number) => {
    const newMeasuredTimes = [
      ...dataStore.getItem('measuredTimes')?.items || [],
      {
        id: randomId(),
        collectionName: collection.name,
        time: Date.now(),
        measuredTime,
        selector,
        callstack,
      },
    ]
    measuredTimes.patch({ items: newMeasuredTimes })
  },
  '_debug.insert': (collection: Collection<any>, callstack: string, item: Record<string, any>) => {
    const newMutations = [
      ...dataStore.getItem('mutations')?.items || [],
      {
        id: randomId(),
        collectionName: collection.name,
        time: Date.now(),
        type: 'insert',
        item,
        callstack,
      },
    ]
    mutations.patch({ items: newMutations })
  },
  '_debug.updateOne': (collection: Collection<any>, callstack: string, selector: Selector<any>, modifier: Modifier<any>) => {
    const newMutations = [
      ...dataStore.getItem('mutations')?.items || [],
      {
        id: randomId(),
        collectionName: collection.name,
        time: Date.now(),
        type: 'updateOne',
        selector,
        modifier,
        callstack,
      },
    ]
    mutations.patch({ items: newMutations })
  },
  '_debug.updateMany': (collection: Collection<any>, callstack: string, selector: Selector<any>, modifier: Modifier<any>) => {
    const newMutations = [
      ...dataStore.getItem('mutations')?.items || [],
      {
        id: randomId(),
        collectionName: collection.name,
        time: Date.now(),
        type: 'updateMany',
        selector,
        modifier,
        callstack,
      },
    ]
    mutations.patch({ items: newMutations })
  },
  '_debug.removeOne': (collection: Collection<any>, callstack: string, selector: Selector<any>) => {
    const newMutations = [
      ...dataStore.getItem('mutations')?.items || [],
      {
        id: randomId(),
        collectionName: collection.name,
        time: Date.now(),
        type: 'removeOne',
        selector,
        callstack,
      },
    ]
    mutations.patch({ items: newMutations })
  },
  '_debug.removeMany': (collection: Collection<any>, callstack: string, selector: Selector<any>) => {
    const newMutations = [
      ...dataStore.getItem('mutations')?.items || [],
      {
        id: randomId(),
        collectionName: collection.name,
        time: Date.now(),
        type: 'removeMany',
        selector,
        callstack,
      },
    ]
    mutations.patch({ items: newMutations })
  },
}

const wrappedHandlersMap = new WeakMap<Function, Map<Collection<any>, Function>>()

/**
 * Wraps a handler function for a specific collection.
 * @param handler - The handler function to wrap.
 * @param collection - The collection to associate with the handler.
 * @returns The wrapped handler function.
 */
function wrapHandler(handler: Function, collection: Collection<any>) {
  let collectionMap = wrappedHandlersMap.get(handler)
  if (!collectionMap) {
    collectionMap = new Map()
    wrappedHandlersMap.set(handler, collectionMap)
  }

  if (!collectionMap.has(collection)) {
    const wrappedHandler = (...args: any[]) => handler(collection, ...args)
    collectionMap.set(collection, wrappedHandler)
  }

  return collectionMap.get(collection) as Function
}

/**
 * Checks if a category is active based on the settings.
 * @param category - The category to check.
 * @returns True if the category is active, false otherwise.
 */
function isCategoryActive(category: string) {
  switch (category) {
    case 'queries': {
      return settingsStore.get().trackQueries
    }
    case 'mutations': {
      return settingsStore.get().trackMutations
    }
    case 'measuredTimes': {
      return settingsStore.get().trackMeasurements
    }
    default: {
      return false
    }
  }
}

/**
 * Registers handlers for the given collections.
 * @param currentCollections - The collections to register handlers for.
 */
function registerHandlers(currentCollections: Collection<any>[]) {
  currentCollections.forEach((collection) => {
    Object.entries(handlers).forEach(([key, handler]) => {
      const activated = handlerCategories[key].some(category => isCategoryActive(category))

      const wrappedHandler = wrapHandler(handler, collection)
      collection.off(key as any, wrappedHandler) // Ensure previous handler is removed

      if (!activated) return
      collection.on(key as any, wrappedHandler) // Register the wrapped handler
    })
  })
}

settingsStore.subscribe(() => {
  registerHandlers((dataStore.getItem('collections')?.items || []) as Collection<any>[])
})

Collection.enableDebugMode()
Collection.onCreation(() => {
  const currentCollections = Collection.getCollections()
  collections.patch({ items: currentCollections })

  registerHandlers(currentCollections)
})

Collection.onDispose(() => {
  const currentCollections = Collection.getCollections()
  collections.patch({ items: currentCollections })
})

dataStore.register('queries', { items: [] })

export default dataStore
