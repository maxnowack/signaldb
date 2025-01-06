import { createPersistenceAdapter } from '@signaldb/core'

/**
 * Creates a persistence adapter for managing a SignalDB collection using IndexedDB.
 * This adapter reads and writes data to an IndexedDB object store, with customizable serialization and deserialization.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param name - A unique name for the collection, used as the database name.
 * @returns A SignalDB persistence adapter for managing data in IndexedDB.
 */
export default function createIndexedDBAdapter<
  T extends { id: I } & Record<string, any>,
  I extends IDBValidKey,
>(name: string) {
  const dbName = `signaldb-${name}`
  const storeName = 'items'

  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error(request.error?.message || 'Database error'))
    })
  }

  async function getAllItems(): Promise<T[]> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => {
        const { result } = request
        resolve(result as T[]) // Ensure proper typing
      }
      request.onerror = () => reject(new Error(request.error?.message || 'Error fetching items'))
    })
  }

  return createPersistenceAdapter<T, I>({
    async load() {
      const items = await getAllItems()
      return { items }
    },
    async save(items, { added, modified, removed }) {
      const db = await openDatabase()
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)

      added.forEach(item => store.add(item))
      modified.forEach(item => store.put(item))
      removed.forEach(item => store.delete(item.id))

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(new Error(transaction.error?.message || 'Transaction error'))
      })
    },
    async register() {
      return Promise.resolve()
    },
  })
}
