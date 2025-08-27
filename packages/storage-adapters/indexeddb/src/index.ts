import { createStorageAdapter } from '@signaldb/core'

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
>(name: string, options?: { prefix?: string }) {
  const { prefix = 'signaldb-' } = options || {}
  const databaseName = `${prefix}${name}`
  const storeName = 'items'

  /**
   * Opens the IndexedDB database and creates the object store if it doesn't exist.
   * @returns A promise that resolves with the opened database.
   */
  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.addEventListener('upgradeneeded', () => {
        const database = request.result
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' })
        }
      })
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
    })
  }

  /**
   * Retrieves all items from the IndexedDB object store.
   * @returns A promise that resolves with an array of items.
   */
  async function getAllItems(): Promise<T[]> {
    const database = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()
      request.addEventListener('success', () => resolve(request.result as T[]))
      request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error fetching items')))
    })
  }

  return createStorageAdapter<T, I>({
    async load() {
      const items = await getAllItems()
      return { items }
    },
    async save(items, { added, modified, removed }) {
      const database = await openDatabase()
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)

      added.forEach(item => store.add(item))
      modified.forEach(item => store.put(item))
      removed.forEach(item => store.delete(item.id))

      return new Promise((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve())
        transaction.addEventListener('error', () => reject(new Error(transaction.error?.message || 'Transaction error')))
      })
    },
    async register() {
      return
    },
  })
}
