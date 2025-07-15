// @vitest-environment happy-dom
import type { EventEmitter } from '@signaldb/core'
import { describe, it, expect } from 'vitest'
import { Collection } from '@signaldb/core'
import createLocalStorageAdapter from '../src'

/**
 * Waits for a specific event to be emitted.
 * @param emitter - The event emitter instance.
 * @param event - The event name to wait for.
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
  describe('localStorage', () => {
    it('should load items from localStorage persistence adapter', async () => {
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')
      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'John' }])
    })

    it('should save items to localStorage persistence adapter', async () => {
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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

    it('should remove item from localStorage persistence adapter', async () => {
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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

    it('should update item in localStorage persistence adapter', async () => {
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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

    it('should not modify original items in localStorage persistence adapter', async () => {
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      const originalItems = [{ id: '1', name: 'John' }]
      await persistence.save([], { added: originalItems, removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')

      await collection.insert({ id: '2', name: 'Jane' })
      await waitForEvent(collection, 'persistence.transmitted')

      expect(originalItems).toEqual([{ id: '1', name: 'John' }])
    })

    it('should handle multiple operations in order', async () => {
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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
      const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
      await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
      const collection = new Collection({ persistence })
      await waitForEvent(collection, 'persistence.init')
      await persistence.save([], { added: [], removed: [], modified: [] })
      const items = collection.find().fetch()
      expect(items).toEqual([{ id: '1', name: 'John' }])
      const loadResult = await persistence.load()
      expect(loadResult.items).toEqual([{ id: '1', name: 'John' }])
    })
  })
})
