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
    request.addEventListener('success', () => resolve())
    request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
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
          .catch(
            /* istanbul ignore next -- @preserve */
            (error) => {
              reject(error as Error)
            },
          )
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

export type IndexedDBOptions = {
  databaseName?: string,
  version: number,
  schema: Record<string, string[]>,
  onUpgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
    newVersion: number | null,
  ) => Promise<void>,
}

/**
 * Prepares an IndexedDB storage adapter for SignalDB with the specified options.
 * @param options - Configuration options for the IndexedDB adapter.
 * @param options.databaseName - The name of the IndexedDB database. Defaults to 'signaldb'.
 * @param options.version - The version of the database schema.
 * @param options.schema - An object defining the schema of the database, where keys are store names and values are arrays of index names.
 * @param options.onUpgrade - Optional callback for handling database upgrades.
 * @returns A function that takes a store name and returns a SignalDB storage adapter for that store.
 */
export default function prepareIndexedDB(options: IndexedDBOptions) {
  const databaseName = options.databaseName || 'signaldb'
  const databasePromise = openDatabase(
    databaseName,
    options.version,
    async (database, tx) => {
      if (options.onUpgrade) {
        await options.onUpgrade(database, tx, database.version, options.version)
      }

      const storesToDelete = new Set<string>()
      for (let i = 0; i < database.objectStoreNames.length; i += 1) {
        const storeName = database.objectStoreNames.item(i)
        if (!storeName || storeName in options.schema) continue
        storesToDelete.add(storeName)
      }

      // Delete stores that are not in the new schema
      storesToDelete.forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) return
        database.deleteObjectStore(storeName)
      })

      // Create or update stores as per the new schema
      for (const [storeName, indexes] of Object.entries(options.schema)) {
        const store = database.objectStoreNames.contains(storeName)
          ? tx.objectStore(storeName)
          : database.createObjectStore(storeName, {
            keyPath: 'id',
          })

        const indexesToDrop = new Set<string>()
        for (let i = 0; i < store.indexNames.length; i += 1) {
          const indexName = store.indexNames.item(i)
          if (!indexName || indexes.includes(indexName)) continue
          indexesToDrop.add(indexName)
        }

        // Drop indexes that are not in the new schema
        indexesToDrop.forEach((indexName) => {
          if (!store.indexNames.contains(indexName)) return
          store.deleteIndex(indexName)
        })

        // Create indexes as per the new schema
        indexes.forEach((index) => {
          if (index === 'id') return
          if (store.indexNames.contains(index)) return
          store.createIndex(index, index, { unique: false })
        })
      }
    },
  )

  return function indexedDBAdapter<
    T extends { id: I } & Record<string, any>,
    I extends IDBValidKey,
  >(storeName: string) {
    return createIndexedDBAdapter<T, I>(storeName, databasePromise)
  }
}

/**
 * Creates a storage adapter for managing a SignalDB collection using IndexedDB.
 * This adapter reads and writes data to an IndexedDB object store, with customizable serialization and deserialization.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param storeName - A unique name for the collection, used as the database name.
 * @param databasePromise - A promise that resolves to an opened IndexedDB database.
 * @returns A SignalDB storage adapter for managing data in IndexedDB.
 */
function createIndexedDBAdapter<
  T extends { id: I } & Record<string, any>,
  I extends IDBValidKey,
>(storeName: string, databasePromise: Promise<IDBDatabase>) {
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

  return createStorageAdapter<T, I>({
    // lifecycle methods
    setup: async () => {
      const database = await databasePromise
      if (database.objectStoreNames.contains(storeName)) return
      throw new Error(`Object store "${storeName}" does not exist in database. Make sure to define it in the schema when initializing the adapter.`)
    },
    teardown: async () => {
      const database = await databasePromise
      database.close()
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
    createIndex: async () => {
      /* noop */
    },
    dropIndex: async () => {
      /* noop */
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
