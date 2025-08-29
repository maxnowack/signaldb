import { createStorageAdapter } from '@signaldb/core'

/**
 * Creates a persistence adapter for managing a SignalDB collection using browser `localStorage`.
 * This implementation mirrors the IndexedDB adapter API (setup/teardown, readAll/readIds,
 * createIndex/dropIndex/readIndex, insert/replace/remove/removeAll) while storing the
 * entire collection as a single JSON array in `localStorage`.
 */

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
  // Use the same variable names and structure as the IndexedDB adapter where possible
  const databaseName = options?.databaseName || 'signaldb'
  const storeName = `${name}`

  // We use a single key that namespaces by database and store names
  const storageKey = `${databaseName}-${storeName}`

  // Track setup to mirror the IndexedDB adapter semantics for index lifecycle
  let setupCalled = false
  const indexesToCreate = new Set<string>()
  const indexesToDrop = new Set<string>()

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
    const items = readFromStorage()
    const result = new Map<any, Set<I>>()
    for (const item of items) {
      const key = (item as Record<string, any>)[field]
      const id = (item as { id: I }).id
      if (!result.has(key)) result.set(key, new Set<I>())
      result.get(key)?.add(id)
    }
    return result
  }

  return createStorageAdapter<T, I>({
    // lifecycle methods
    setup: async () => {
      setupCalled = true
      // For localStorage, there is no database to open; we just ensure the key exists
      if (localStorage.getItem(storageKey) == null) {
        writeToStorage([])
      }

      // There is no real index management in localStorage, so we simply acknowledge
      // any queued index changes without persisting them. This mirrors the timing
      // constraints (must be called before setup) of the IndexedDB adapter API.
      // No further action needed.
    },
    teardown: async () => {
      // Nothing to close for localStorage
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
      if (setupCalled) throw new Error('createIndex must be called before setup()')
      indexesToCreate.add(field)
    },
    dropIndex: async (field) => {
      if (setupCalled) throw new Error('createIndex must be called before setup()')
      indexesToDrop.add(field)
    },
    readIndex,

    // data manipulation methods
    insert: async (newItems) => {
      const items = readFromStorage()
      const byId = new Map<I, T>(items.map(item => [item.id, item]))
      for (const item of newItems) {
        if (byId.has(item.id)) {
          // Keep existing if already present to mirror an add-only semantic
          // (IndexedDB add() would fail if key exists). Here we overwrite to keep
          // behavior predictable across adapters.
          byId.set(item.id, item)
        } else {
          byId.set(item.id, item)
        }
      }
      writeToStorage([...byId.values()])
    },
    replace: async (itemsToReplace) => {
      const items = readFromStorage()
      const byId = new Map<I, T>(items.map(item => [item.id, item]))
      for (const item of itemsToReplace) {
        byId.set(item.id, item)
      }
      writeToStorage([...byId.values()])
    },
    remove: async (itemsToRemove) => {
      const items = readFromStorage()
      const removeSet = new Set<I>(itemsToRemove.map(item => item.id))
      const remaining = items.filter(item => !removeSet.has(item.id))
      writeToStorage(remaining)
    },
    removeAll: async () => {
      writeToStorage([])
    },
  })
}
