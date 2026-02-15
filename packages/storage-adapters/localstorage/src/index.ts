import { createStorageAdapter, get, serializeValue } from '@signaldb/core'

/**
 * Creates a storage adapter for managing a SignalDB collection using localStorage.
 * @param name - A unique name for the collection, used as part of the localStorage key.
 * @param options - Optional configuration for the adapter.
 * @param options.databaseName - An optional name for the database to namespace the storage (default: 'signaldb').
 * @param options.serialize - A function to serialize items to a string (default: `JSON.stringify`).
 * @param options.deserialize - A function to deserialize a string into items (default: `JSON.parse`).
 * @returns A SignalDB storage adapter for managing data in localStorage.
 */
export default function createLocalStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(
  name: string,
  options?: {
    databaseName?: string,
    serialize?: (items: any) => string,
    deserialize?: (itemsString: string) => any,
  },

) {
  const localStorage = globalThis.localStorage
  if (localStorage == null) {
    throw new Error('localStorage is not available in this environment')
  }

  const serialize = options?.serialize || (data => JSON.stringify(data))
  const deserialize = options?.deserialize || (input => JSON.parse(input))
  const databaseName = options?.databaseName || 'signaldb'
  const storeName = `${name}`

  // We use a single key that namespaces by database and store names
  const storageKey = `${databaseName}-${storeName}`

  const indexKeyFor = (field: string) => `${storageKey}-index-${field}`
  const indices: string[] = []

  const readFromStorage = (): T[] => {
    const serialized = localStorage.getItem(storageKey)
    if (!serialized) return []
    try {
      const parsed = deserialize(serialized)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      // If parsing fails, treat as empty to avoid corrupting runtime
      return []
    }
  }

  const writeToStorage = (items: T[]) => {
    localStorage.setItem(storageKey, serialize(items))
  }

  const readIndex = async (field: string) => {
    const serialized = localStorage.getItem(indexKeyFor(field))
    if (!serialized) throw new Error(`Index on field "${field}" does not exist`)
    let data: Record<string, I[]>
    try {
      data = deserialize(serialized)
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

  const saveIndexMap = (field: string, index: Map<any, Set<I>>) => {
    const safeIndex: Record<string, I[]> = {}
    index.forEach((ids, key) => {
      safeIndex[String(serializeValue(key))] = [...ids]
    })
    localStorage.setItem(indexKeyFor(field), serialize(safeIndex))
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
    saveIndexMap(field, index)
  }

  // --- Delta indexing helpers ---
  const safeKeyFor = (value: any) => String(serializeValue(value))

  const loadIndexMap = (field: string): Map<string, Set<I>> | undefined => {
    const serialized = localStorage.getItem(indexKeyFor(field))
    if (!serialized) return undefined
    let data: Record<string, I[]>
    try {
      data = deserialize(serialized)
    } catch {
      throw new Error(`Corrupted index on field "${field}"`)
    }
    const index = new Map<string, Set<I>>()
    Object.entries(data).forEach(([key, ids]) => {
      index.set(key, new Set(ids))
    })
    return index
  }

  type IndexDelta = {
    adds: Map<string, Set<I>>,
    removes: Map<string, Set<I>>,
  }

  const addToDelta = (
    deltas: Map<string, IndexDelta>,
    field: string,
    kind: 'add' | 'remove',
    key: string,
    id: I,
  ) => {
    if (!deltas.has(field)) {
      deltas.set(field, { adds: new Map(), removes: new Map() })
    }
    const delta = deltas.get(field)
    if (!delta) return
    const target = kind === 'add' ? delta.adds : delta.removes
    if (!target.has(key)) target.set(key, new Set<I>())
    target.get(key)?.add(id)
  }

  const applyIndexDeltas = (deltas: Map<string, IndexDelta>) => {
    // Update only the indices that have changes
    deltas.forEach((delta, field) => {
      const index = loadIndexMap(field)
      // If the index doesn't exist, skip (we only maintain indices that were created)
      if (!index) return

      // Apply removals
      delta.removes.forEach((ids, key) => {
        const set = index.get(key)
        if (!set) return
        ids.forEach(id => set.delete(id))
        if (set.size === 0) index.delete(key)
      })

      // Apply additions
      delta.adds.forEach((ids, key) => {
        let set = index.get(key)
        if (!set) {
          set = new Set<I>()
          index.set(key, set)
        }
        ids.forEach(id => set.add(id))
      })

      saveIndexMap(field, index)
    })
  }

  const addDeltaForChange = (
    deltas: Map<string, IndexDelta>,
    field: string,
    oldValue: any,
    newValue: any,
    id: I,
  ) => {
    const oldKey = oldValue == null ? undefined : safeKeyFor(oldValue)
    const newKey = newValue == null ? undefined : safeKeyFor(newValue)
    if (oldKey === newKey) return
    if (oldKey != null) addToDelta(deltas, field, 'remove', oldKey, id)
    if (newKey != null) addToDelta(deltas, field, 'add', newKey, id)
  }

  const accumulateUpsertDelta = (
    deltas: Map<string, IndexDelta>,
    existing: T | undefined,
    next: T,
  ) => {
    if (existing) {
      for (const field of indices) {
        addDeltaForChange(deltas, field, get(existing, field), get(next, field), next.id)
      }
    } else {
      for (const field of indices) {
        const value = get(next, field)
        if (value == null) continue
        addToDelta(deltas, field, 'add', safeKeyFor(value), next.id)
      }
    }
  }

  const accumulateRemoveDelta = (
    deltas: Map<string, IndexDelta>,
    existing: T,
  ) => {
    for (const field of indices) {
      const value = get(existing, field)
      if (value == null) continue
      addToDelta(deltas, field, 'remove', safeKeyFor(value), existing.id)
    }
  }

  const upsertItems = (itemsToUpsert: T[]) => {
    const items = readFromStorage()
    const byId = new Map<I, T>(items.map(item => [item.id, item]))

    const deltas = new Map<string, IndexDelta>()

    for (const item of itemsToUpsert) {
      const existing = byId.get(item.id)
      accumulateUpsertDelta(deltas, existing, item)
      byId.set(item.id, item)
    }

    writeToStorage([...byId.values()])
    applyIndexDeltas(deltas)
  }

  return createStorageAdapter<T, I>({
    // lifecycle methods
    setup: async () => {
      // For localStorage, there is no database to open; we just ensure the key exists
      if (localStorage.getItem(storageKey) == null) {
        writeToStorage([])
      }
      // Hydrate known index fields from existing keys so that we can keep them updated across sessions
      const prefix = `${storageKey}-index-`
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix)) {
          const field = k.slice(prefix.length)
          if (!indices.includes(field)) indices.push(field)
        }
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
      if (field === 'id') throw new Error('Cannot create index on id field')
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
      upsertItems(newItems)
    },
    replace: async (itemsToReplace) => {
      upsertItems(itemsToReplace)
    },
    remove: async (itemsToRemove) => {
      const items = readFromStorage()
      const byId = new Map<I, T>(items.map(item => [item.id, item]))

      const deltas = new Map<string, IndexDelta>()
      const removeSet = new Set<I>(itemsToRemove.map(item => item.id))

      removeSet.forEach((id) => {
        const existing = byId.get(id)
        if (!existing) return
        accumulateRemoveDelta(deltas, existing)
        byId.delete(id)
      })

      writeToStorage([...byId.values()])
      applyIndexDeltas(deltas)
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
