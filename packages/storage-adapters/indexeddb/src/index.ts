import { createStorageAdapter } from '@signaldb/core'

/**
 * Opens the IndexedDB database and creates the object store if it doesn't exist.
 * @param databaseName - The name of the database.
 * @param version - The version of the database.
 * @param onUpgrade - Optional callback for handling database upgrades.
 * @returns A promise that resolves with the opened database.
 */
async function openDatabase(
  databaseName: string,
  version = 1,
  onUpgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
    newVersion: number | null,
  ) => Promise<void>,
): Promise<IDBDatabase> {
  const request = indexedDB.open(databaseName, version)
  const upgradePromise = new Promise<void>((resolve, reject) => {
    request.addEventListener('upgradeneeded', (event) => {
      const database = request.result
      const tx = request.transaction as IDBTransaction
      if (onUpgrade) {
        onUpgrade(
          database,
          tx,
          event.oldVersion,
          event.newVersion ?? null,
        )
          .then(() => resolve())
          .catch((error) => {
            /* istanbul ignore next -- @preserve */
            reject(error as Error)
          })
        return
      }

      // No custom upgrade logic provided, resolve immediately
      /* istanbul ignore next -- @preserve */
      resolve()
    })
  })
  const databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
  })
  await Promise.all([
    databasePromise,
    upgradePromise,
  ])
  return databasePromise
}

type IndexedDatabaseAdapterOptions = {
  databaseName?: string,
  version?: number,
  onUpgrade?: (
    database: IDBDatabase,
    oldVersion: number,
    newVersion: number | null,
  ) => Promise<void>,
}

/**
 * Creates a persistence adapter for managing a SignalDB collection using IndexedDB.
 * This adapter reads and writes data to an IndexedDB object store, with customizable serialization and deserialization.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param name - A unique name for the collection, used as the database name.
 * @param options - Optional configuration for the adapter.
 * @param options.prefix - A prefix to be added to the database name (default: 'signaldb-').
 * @returns A SignalDB persistence adapter for managing data in IndexedDB.
 */
export default function createIndexedDBAdapter<
  T extends { id: I } & Record<string, any>,
  I extends IDBValidKey,
>(name: string, options?: IndexedDatabaseAdapterOptions) {
  const databaseName = options?.databaseName || 'signaldb'
  const storeName = `${name}`
  let databasePromise: Promise<IDBDatabase> | null = null

  const getStore = async (writeAccess = false) => {
    const database = await databasePromise
    if (!database) throw new Error('Database not initialized')
    const transaction = database.transaction(storeName, writeAccess ? 'readwrite' : 'readonly')
    const store = transaction.objectStore(storeName)
    return store
  }

  const readIndex = async (field: string) => {
    const store = await getStore()
    if (!store.indexNames.contains(field)) {
      throw new Error(`Index on field "${field}" does not exist`)
    }
    return new Promise<Map<any, Set<I>>>((resolve, reject) => {
      const index = store.index(field)
      const result = new Map<any, Set<I>>()
      const request = index.openCursor()
      request.addEventListener('success', () => {
        const cursor = request.result
        if (cursor) {
          const key = cursor.key as T[keyof T & string]
          const id = (cursor.value as T).id
          if (!result.has(key)) {
            result.set(key, new Set())
          }
          result.get(key)?.add(id)
          cursor.continue()
        } else {
          resolve(result)
        }
      })
      request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error reading index')))
    })
  }

  let setupCalled = false
  const indexesToCreate = new Set<string>()
  const indexesToDrop = new Set<string>()

  return createStorageAdapter<T, I>({
    // lifecycle methods
    setup: async () => {
      setupCalled = true
      databasePromise = openDatabase(
        databaseName,
        options?.version,
        async (database, tx) => {
          // Ensure the object store exists; if not, create it within the same upgrade transaction
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, {
              keyPath: 'id',
              autoIncrement: true,
            })
          }

          // If there are no index changes, nothing else to do
          if (indexesToCreate.size === 0 && indexesToDrop.size === 0) return

          // Use the provided versionchange transaction to mutate indexes
          const store = tx.objectStore(storeName)

          indexesToCreate.forEach((field) => {
            if (store.indexNames.contains(field)) return
            store.createIndex(field, field, { unique: false })
          })

          indexesToDrop.forEach((field) => {
            if (!store.indexNames.contains(field)) return
            store.deleteIndex(field)
          })
        },
      )
      await databasePromise
    },
    teardown: async () => {
      if (!databasePromise) return
      const database = await databasePromise
      database.close()
      databasePromise = null
    },

    // data retrieval methods
    readAll: async () => {
      const store = await getStore()
      return new Promise<T[]>((resolve, reject) => {
        const request = store.getAll()
        request.addEventListener('success', () => resolve(request.result as T[]))
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error fetching items')))
      })
    },
    readIds: async (ids) => {
      const store = await getStore()
      const results = await Promise.all(ids.map(id => new Promise<T | null>((resolve, reject) => {
        const request = store.get(id)
        request.addEventListener('success', () => resolve(request.result as T || null))
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error fetching item')))
      })))
      return results.filter(item => item !== null)
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
      const store = await getStore(true)
      await Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
        const request = store.add(item)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error inserting item')))
      })))
    },
    replace: async (items) => {
      const store = await getStore(true)
      await Promise.all(items.map(item => new Promise<void>((resolve, reject) => {
        const request = store.put(item)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error replacing item')))
      })))
    },
    remove: async (itemsToRemove) => {
      const store = await getStore(true)
      await Promise.all(itemsToRemove.map(async item => new Promise<void>((resolve, reject) => {
        const request = store.delete(item.id)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error removing item')))
      })))
    },
    removeAll: async () => {
      const store = await getStore(true)
      return new Promise<void>((resolve, reject) => {
        const request = store.clear()
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error clearing items')))
      })
    },
  })
}
