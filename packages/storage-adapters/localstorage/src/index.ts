import { createStorageAdapter, get, serializeValue } from '@signaldb/core'

type LocalStorageAdapterOptions = {
  /** Optional logical database name, used to namespace the localStorage key. */
  databaseName?: string,
}

/**
 * Creates a persistence adapter for managing a SignalDB collection using localStorage.
 * @param name - A unique name for the collection, used as part of the localStorage key.
 * @param options - Optional configuration for the adapter.
 * @param options.databaseName - An optional logical database name to namespace the localStorage key (default: 'signaldb').
 * @returns A SignalDB persistence adapter for managing data in localStorage.
 */
export default function createLocalStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(name: string, options?: LocalStorageAdapterOptions) {
  const databaseName = options?.databaseName || 'signaldb'
  const storeName = `${name}`

  // We use a single key that namespaces by database and store names
  const storageKey = `${databaseName}-${storeName}`

  const indexKeyFor = (field: string) => `${storageKey}-index-${field}`
  const indices: string[] = []

  type SafeIndex = Record<string, I[]>

  const readFromStorage = (): T[] => {
    const serialized = localStorage.getItem(storageKey)
    if (!serialized) return []
    try {
      const parsed = JSON.parse(serialized)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      // If parsing fails, treat as empty to avoid corrupting runtime
      return []
    }
  }

  const writeToStorage = (items: T[]) => {
    localStorage.setItem(storageKey, JSON.stringify(items))
  }

  const readIndex = async (field: string) => {
    const serialized = localStorage.getItem(indexKeyFor(field))
    if (!serialized) throw new Error(`Index on field "${field}" does not exist`)
    let data: SafeIndex
    try {
      data = JSON.parse(serialized) as SafeIndex
    } catch {
      throw new Error(`Corrupted index on field "${field}"`)
    }
    const index = new Map<any, Set<I>>()
    Object.entries(data).forEach(([key, ids]) => {
      if (!index.has(key)) index.set(key, new Set())
      ids.forEach(id => index.get(key)?.add(id))
    })
    return index
  }

  const ensureIndex = async (
    field: string,
    items: T[] = readFromStorage(),
  ) => {
    const index = new Map<any, Set<I>>()
    items.forEach((item) => {
      const fieldValue = get(item, field)
      if (fieldValue == null) return
      if (!index.has(fieldValue)) index.set(fieldValue, new Set())
      index.get(fieldValue)?.add(item.id)
    })
    const safeIndex: SafeIndex = {}
    index.forEach((ids, key) => {
      const safeKey = String(serializeValue(key))
      safeIndex[safeKey] = [...ids]
    })
    localStorage.setItem(indexKeyFor(field), JSON.stringify(safeIndex))
  }

  const updateAllIndices = async () => {
    const items = readFromStorage()
    await Promise.all(indices.map(field => ensureIndex(field, items)))
  }

  return createStorageAdapter<T, I>({
    // lifecycle methods
    setup: async () => {
      // For localStorage, there is no database to open; we just ensure the key exists
      if (localStorage.getItem(storageKey) == null) {
        writeToStorage([])
      }
    },
    teardown: async () => {
      // no-op
    },

    // data retrieval methods
    readAll: async () => {
      return readFromStorage()
    },
    readIds: async (ids) => {
      const items = readFromStorage()
      const idSet = new Set<I>(ids)
      return items.filter(item => idSet.has(item.id))
    },

    // index methods
    createIndex: async (field) => {
      if (!indices.includes(field)) indices.push(field)
      await ensureIndex(field)
    },
    dropIndex: async (field) => {
      if (indices.includes(field)) {
        const i = indices.indexOf(field)
        indices.splice(i, 1)
      }
      const key = indexKeyFor(field)
      if (localStorage.getItem(key) == null) {
        throw new Error(`Index on field "${field}" does not exist`)
      }
      localStorage.removeItem(key)
    },
    readIndex,

    // data manipulation methods
    insert: async (newItems) => {
      const items = readFromStorage()
      const byId = new Map<I, T>(items.map(item => [item.id, item]))
      for (const item of newItems) {
        byId.set(item.id, item)
      }
      writeToStorage([...byId.values()])
      await updateAllIndices()
    },
    replace: async (itemsToReplace) => {
      const items = readFromStorage()
      const byId = new Map<I, T>(items.map(item => [item.id, item]))
      for (const item of itemsToReplace) {
        byId.set(item.id, item)
      }
      writeToStorage([...byId.values()])
      await updateAllIndices()
    },
    remove: async (itemsToRemove) => {
      const items = readFromStorage()
      const removeSet = new Set<I>(itemsToRemove.map(item => item.id))
      const remaining = items.filter(item => !removeSet.has(item.id))
      writeToStorage(remaining)
      await updateAllIndices()
    },
    removeAll: async () => {
      writeToStorage([])
      // remove all index keys for this store
      const prefix = `${storageKey}-index-`
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix)) keysToRemove.push(k)
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
      indices.splice(0)
    },
  })
}
