import { createStorageAdapter } from '../../src'

/**
 * Creates a memory-based persistence adapter for testing purposes. This adapter
 * mimics the behavior of a SignalDB persistence adapter, allowing in-memory storage
 * and change tracking with optional transmission of changes and delays.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param initialData - An array of initial data items to populate the memory store.
 * @param delay - An optional delay (in milliseconds) for load operations to simulate asynchronous behavior.
 * @returns A memory persistence adapter with additional methods for adding, changing, and removing items.
 * @example
 * import memoryStorageAdapter from './memoryStorageAdapter';
 *
 * const adapter = memoryStorageAdapter([{ id: 1, name: 'Test' }], true, 100);
 *
 * // Add a new item
 * adapter.addNewItem({ id: 2, name: 'New Item' });
 *
 * // Change an item
 * adapter.changeItem({ id: 1, name: 'Updated Test' });
 *
 * // Remove an item
 * adapter.removeItem({ id: 2, name: 'New Item' });
 *
 * // Load items or changes
 * const { items } = await adapter.load();
 * console.log(items); // Logs the updated items in memory.
 */
export default function memoryStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I = any,
>(
  initialData: T[] = [],
  delay?: number,
) {
  // not really a "persistence adapter", but it works for testing
  let items = [...initialData]
  const indexes = new Map<keyof T & string, Map<T[keyof T & string], Set<number>>>()

  return createStorageAdapter<T, I>({
    setup: () => Promise.resolve(),
    teardown: () => Promise.resolve(),

    readAll: async () => {
      if (delay != null) await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
      return items
    },
    readPositions: positions => Promise.resolve(
      items.filter((_item, index) => positions.includes(index)),
    ),

    createIndex: (field) => {
      if (indexes.has(field)) {
        throw new Error(`Index on field "${field}" already exists`)
      }
      const index = new Map<T[keyof T & string], Set<number>>()
      indexes.set(field, index)
      return Promise.resolve()
    },
    dropIndex: (field) => {
      indexes.delete(field)
      return Promise.resolve()
    },
    readIndex: async (field) => {
      const index = indexes.get(field)
      if (index == null) {
        throw new Error(`Index on field "${field}" does not exist`)
      }
      return index
    },

    insert: (newItems) => {
      items.push(...newItems)
      return Promise.resolve()
    },
    replace: (newItems) => {
      items = items.map((item) => {
        const newItem = newItems.find(i => i.id === item.id)
        return newItem || item
      })
      return Promise.resolve()
    },
    remove: (itemsToRemove) => {
      const idsToRemove = new Set(itemsToRemove.map(i => i.id))
      items = items.filter(item => !idsToRemove.has(item.id))
      return Promise.resolve()
    },
    removeAll: () => {
      items = []
      return Promise.resolve()
    },
  })
}
