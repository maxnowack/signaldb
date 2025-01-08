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
  const databaseName = `signaldb-${name}`
  const storeName = 'items'

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

  return createPersistenceAdapter<T, I>({
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
