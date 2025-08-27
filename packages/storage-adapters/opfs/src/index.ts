import { createStorageAdapter } from '@signaldb/core'

/**
 * Creates a persistence adapter for managing a SignalDB collection using the
 * Origin Private File System (OPFS). This adapter allows data to be stored and managed
 * directly in the browser's file system with support for customizable serialization
 * and deserialization.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param filename - The name of the file in OPFS where data will be stored.
 * @param options - Optional configuration for serialization and deserialization.
 * @param options.serialize - A function to serialize items to a string (default: `JSON.stringify`).
 * @param options.deserialize - A function to deserialize a string into items (default: `JSON.parse`).
 * @returns A SignalDB persistence adapter for managing data in OPFS.
 * @example
 * import createOPFSAdapter from './createOPFSAdapter';
 * import { Collection } from '@signaldb/core';
 *
 * const adapter = createOPFSAdapter('myCollection.json', {
 *   serialize: (items) => JSON.stringify(items, null, 2), // Pretty-print JSON
 *   deserialize: (itemsString) => JSON.parse(itemsString), // Default JSON parse
 * });
 *
 * const collection = new Collection({
 *   persistence: adapter,
 * });
 *
 * // Perform operations on the collection, and changes will be reflected in the OPFS file.
 */
export default function createOPFSAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(
  filename: string,
  options?: {
    serialize?: (items: T[]) => string,
    deserialize?: (itemsString: string) => T[],
  },
) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options || {}

  let savePromise: Promise<void> | null = null

  /**
   * Retrieves the items from the OPFS file.
   * @returns A promise that resolves to an array of items.
   */
  async function getItems(): Promise<T[]> {
    const opfsRoot = await navigator.storage.getDirectory()
    const existingFileHandle = await opfsRoot.getFileHandle(filename, { create: true })
    const serializedItems = await existingFileHandle.getFile().then(value => value.text())
    return serializedItems ? deserialize(serializedItems) : []
  }

  return createStorageAdapter<T, I>({
    async register(onChange) {
      const opfsRoot = await navigator.storage.getDirectory()
      await opfsRoot.getFileHandle(filename, { create: true })
      void onChange()
    },
    async load() {
      if (savePromise) await savePromise

      const items = await getItems()
      return { items }
    },
    async save(_items, { added, modified, removed }) {
      if (savePromise) await savePromise
      const opfsRoot = await navigator.storage.getDirectory()
      const existingFileHandle = await opfsRoot.getFileHandle(filename, { create: true })
      if (added.length === 0 && modified.length === 0 && removed.length === 0) {
        const writeStream = await existingFileHandle.createWritable()
        await writeStream.write(serialize(_items))
        await writeStream.close()
        await savePromise
        return
      }
      savePromise = getItems()
        .then((currentItems) => {
          const items = [...currentItems]
          added.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            /* istanbul ignore if -- @preserve */
            if (index !== -1) {
              items[index] = item
              return
            }
            items.push(item)
          })
          modified.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            /* istanbul ignore if -- @preserve */
            if (index === -1) {
              items.push(item)
              return
            }
            items[index] = item
          })
          removed.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            /* istanbul ignore if -- @preserve */
            if (index === -1) return
            items.splice(index, 1)
          })
          return items
        })
        .then(async (items) => {
          const writeStream = await existingFileHandle.createWritable()
          await writeStream.write(serialize(items))
          await writeStream.close()
        })
        .then(() => {
          savePromise = null
        })
      await savePromise
    },
  })
}
