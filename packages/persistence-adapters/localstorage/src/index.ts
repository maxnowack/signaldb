import { createPersistenceAdapter } from '@signaldb/core'

/**
 * Creates a persistence adapter for managing a SignalDB collection using browser `localStorage`.
 * This adapter reads and writes data to `localStorage`, with customizable serialization and deserialization.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param name - A unique name for the collection, used as the key in `localStorage`.
 * @param options - Optional configuration for serialization and deserialization.
 * @param options.serialize - A function to serialize items to a string (default: `JSON.stringify`).
 * @param options.deserialize - A function to deserialize a string into items (default: `JSON.parse`).
 * @returns A SignalDB persistence adapter for managing data in `localStorage`.
 * @example
 * import createLocalStorageAdapter from './createLocalStorageAdapter';
 *
 * const adapter = createLocalStorageAdapter('myCollection', {
 *   serialize: (items) => JSON.stringify(items, null, 2), // Pretty-print JSON
 *   deserialize: (itemsString) => JSON.parse(itemsString), // Default JSON parse
 * });
 *
 * const collection = new Collection({
 *   persistence: adapter,
 * });
 *
 * // Perform operations on the collection, and changes will be reflected in local storage.
 */
export default function createLocalStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(
  name: string,
  options?: {
    serialize?: (items: T[]) => string,
    deserialize?: (itemsString: string) => T[],
  },
) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options || {}

  const collectionId = `signaldb-collection-${name}`
  function getItems(): T[] {
    return deserialize(localStorage.getItem(collectionId) || '[]')
  }
  return createPersistenceAdapter<T, I>({
    async load() {
      const items = getItems()
      return Promise.resolve({ items })
    },
    async save(items, { added, modified, removed }) {
      const currentItems = getItems()
      added.forEach((item) => {
        currentItems.push(item)
      })
      modified.forEach((item) => {
        const index = currentItems.findIndex(({ id }) => id === item.id)
        /* istanbul ignore if -- @preserve */
        if (index === -1) throw new Error(`Item with ID ${item.id as string} not found`)
        currentItems[index] = item
      })
      removed.forEach((item) => {
        const index = currentItems.findIndex(({ id }) => id === item.id)
        /* istanbul ignore if -- @preserve */
        if (index === -1) throw new Error(`Item with ID ${item.id as string} not found`)
        currentItems.splice(index, 1)
      })
      localStorage.setItem(collectionId, serialize(currentItems))
      return Promise.resolve()
    },
    async register() {
      return Promise.resolve()
    },
  })
}
