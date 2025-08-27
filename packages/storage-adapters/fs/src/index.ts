import { createStorageAdapter } from '@signaldb/core'

/**
 * Creates a persistence adapter for managing a SignalDB collection backed by a filesystem.
 * This adapter reads and writes data to a file, providing serialization and deserialization options.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param filename - The name of the file to read/write data from/to.
 * @param options - Optional configuration for serialization and deserialization.
 * @param options.serialize - A function to serialize items to a string (default: `JSON.stringify`).
 * @param options.deserialize - A function to deserialize a string into items (default: `JSON.parse`).
 * @returns A SignalDB persistence adapter for managing data in the filesystem.
 * @example
 * import createFilesystemAdapter from './createFilesystemAdapter';
 *
 * const adapter = createFilesystemAdapter('data.json', {
 *   serialize: (items) => JSON.stringify(items, null, 2), // Pretty-print JSON
 *   deserialize: (itemsString) => JSON.parse(itemsString), // Default JSON parse
 * });
 *
 * const collection = new Collection({
 *   persistence: adapter,
 * });
 *
 * // Perform operations on the collection, and changes will be reflected in the file.
 */
export default function createFilesystemAdapter<
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
   * Retrieves the items from the file.
   * @returns A promise that resolves to an array of items.
   */
  async function getItems(): Promise<T[]> {
    const fs = await import('fs')
    const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
    if (!exists) return []
    const serializedItems = await fs.promises.readFile(filename, 'utf8').catch((error) => {
      /* istanbul ignore next -- @preserve */
      if (error.code === 'ENOENT') return
      /* istanbul ignore next -- @preserve */
      throw error
    })
    return serializedItems ? deserialize(serializedItems) : []
  }

  return createStorageAdapter<T, I>({
    async register(onChange) {
      // eslint-disable-next-line unicorn/prefer-global-this
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const fs = await import('fs')
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) await fs.promises.writeFile(filename, '[]')
      fs.watch(filename, { encoding: 'utf8' }, () => {
        void onChange()
      })
    },
    async load() {
      // eslint-disable-next-line unicorn/prefer-global-this
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      if (savePromise) await savePromise
      const items = await getItems()
      return { items }
    },
    async save(_items, { added, modified, removed }) {
      // eslint-disable-next-line unicorn/prefer-global-this
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      if (savePromise) await savePromise
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
          const fs = await import('fs')
          await fs.promises.writeFile(filename, serialize(items))
        })
        .then(() => {
          savePromise = null
        })
      await savePromise
    },
  })
}
