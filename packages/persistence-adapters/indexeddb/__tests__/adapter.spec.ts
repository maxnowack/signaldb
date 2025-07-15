// @vitest-environment happy-dom
import type { EventEmitter } from '@signaldb/core'
import { describe, it, expect } from 'vitest'
import { Collection } from '@signaldb/core'
import 'fake-indexeddb/auto'
import createIndexedDBAdapter from '../src'

/**
 * Waits for a specific event to be emitted.
 * @param emitter - The event emitter.
 * @param event - The event to wait for.
 * @param [timeout] - Optional timeout in milliseconds.
 * @returns A promise that resolves with the event value.
 */
async function waitForEvent<T>(
  emitter: EventEmitter<any>,
  event: string,
  timeout?: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = timeout && setTimeout(() => {
      reject(new Error('waitForEvent timeout'))
    }, timeout)

    emitter.once(event, (value: T) => {
      if (timeoutId) clearTimeout(timeoutId)
      resolve(value)
    })
  })
}

describe('Persistence', () => {
  describe('IndexedDB', () => {
    it('should load items from IndexedDB persistence adapter', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')
      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'John' }])
    })

    it('should save items to IndexedDB persistence adapter', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')
      await collection.insert({ id: '1', name: 'John' })
      await waitForEvent(collection, 'persistence.transmitted')
      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'John' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '1', name: 'John' }])
    })

    it('should remove item from IndexedDB persistence adapter', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')

      await collection.removeOne({ id: '1' })
      await waitForEvent(collection, 'persistence.transmitted')

      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '2', name: 'Jane' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '2', name: 'Jane' }])
    })

    it('should update item in IndexedDB persistence adapter', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')

      await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
      await waitForEvent(collection, 'persistence.transmitted')

      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'Johnny' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '1', name: 'Johnny' }])
    })

    it('should not modify original items in IndexedDB persistence adapter', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      const originalItems = [{ id: '1', name: 'John' }]
      await persistence.save([], { added: originalItems, removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')

      await collection.insert({ id: '2', name: 'Jane' })
      await waitForEvent(collection, 'persistence.transmitted')

      expect(originalItems).toEqual([{ id: '1', name: 'John' }])
    })

    it('should handle multiple operations in order', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')

      await collection.insert({ id: '1', name: 'John' })
      await waitForEvent(collection, 'persistence.transmitted')
      await collection.insert({ id: '2', name: 'Jane' })
      await waitForEvent(collection, 'persistence.transmitted')
      await collection.removeOne({ id: '1' })
      await waitForEvent(collection, 'persistence.transmitted')

      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '2', name: 'Jane' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '2', name: 'Jane' }])
    })

    it('should persist data that was modified before persistence.init on client side', { retry: 5 }, async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
      await collection.removeOne({ id: '2' })
      await waitForEvent(collection, 'persistence.init')

      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'Johnny' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '1', name: 'Johnny' }])
    })

    it('should not overwrite persisted data if items is undefined and changeSet is empty.', async () => {
      const persistence = createIndexedDBAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')
      await persistence.save([], { added: [], removed: [], modified: [] })
      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'John' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '1', name: 'John' }])
    })

    it('should use custom prefix when provided in options', async () => {
      const collectionName = `test-${Math.floor(Math.random() * 1e17).toString(16)}`
      const customPrefix = 'custom-prefix-'
      const persistence = createIndexedDBAdapter(collectionName, { prefix: customPrefix })
      await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })

      // Verify data was saved with the custom prefix by opening the database directly
      const openRequest = indexedDB.open(`${customPrefix}${collectionName}`, 1)
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        openRequest.addEventListener('success', () => resolve(openRequest.result))
        openRequest.addEventListener('error', () => reject(new Error('Failed to open database with custom prefix')))
      })

      const transaction = database.transaction('items', 'readonly')
      const store = transaction.objectStore('items')
      const getAllRequest = store.getAll()

      const items = await new Promise<any[]>((resolve, reject) => {
        getAllRequest.addEventListener('success', () => resolve(getAllRequest.result))
        getAllRequest.addEventListener('error', () => reject(new Error('Failed to get items')))
      })

      expect(items).toEqual([{ id: '1', name: 'John' }])
      database.close()
    })
  })
})
