import type { StorageAdapter } from '../../src'

/**
 * Creates a memory-based persistence adapter for testing purposes. This adapter
 * mimics the behavior of a SignalDB persistence adapter, allowing in-memory storage
 * and change tracking with optional transmission of changes and delays.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param initialData - An array of initial data items to populate the memory store.
 * @param transmitChanges - A boolean indicating whether to transmit changes instead of the full dataset (default: `false`).
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
  transmitChanges = false,
  delay?: number,
) {
  // not really a "persistence adapter", but it works for testing
  let items = [...initialData]
  const changes: {
    added: T[],
    modified: T[],
    removed: T[],
  } = {
    added: [],
    modified: [],
    removed: [],
  }
  let onChange: () => void | Promise<void> = () => { /* do nothing */ }
  return {
    register: (changeCallback: () => void | Promise<void>) => {
      onChange = changeCallback
      return Promise.resolve()
    },
    load: async () => {
      const currentChanges = { ...changes }
      changes.added = []
      changes.modified = []
      changes.removed = []
      const hasChanges = currentChanges.added.length > 0
        || currentChanges.modified.length > 0
        || currentChanges.removed.length > 0
      if (delay != null) await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
      if (transmitChanges && hasChanges) {
        return { changes: currentChanges }
      }
      return { items }
    },
    save: (newSnapshot: T[]) => {
      items = [...newSnapshot]
      return Promise.resolve()
    },
    addNewItem: (item: T) => {
      items.push(item)
      changes.added.push(item)
      void onChange()
    },
    changeItem: (item: T) => {
      items = items.map(i => (i.id === item.id ? item : i))
      changes.modified.push(item)
      void onChange()
    },
    removeItem: (item: T) => {
      items = items.filter(i => i.id !== item.id)
      changes.removed.push(item)
      void onChange()
    },
  } as (StorageAdapter<T, I> & {
    addNewItem: (item: T) => void,
    changeItem: (item: T) => void,
    removeItem: (item: T) => void,
  })
}
