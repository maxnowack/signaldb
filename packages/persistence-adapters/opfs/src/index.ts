import { createPersistenceAdapter } from '@signaldb/core'

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

  async function getItems(): Promise<T[]> {
    const opfsRoot = await navigator.storage.getDirectory()
    const existingFileHandle = await opfsRoot.getFileHandle(filename, { create: true })
    const contents = await existingFileHandle.getFile().then(val => val.text())
    return deserialize(contents || '[]')
  }

  return createPersistenceAdapter<T, I>({
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
          const items = currentItems.slice()
          added.forEach((item) => {
            items.push(item)
          })
          modified.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            /* istanbul ignore if -- @preserve */
            if (index === -1) throw new Error(`Item with ID ${item.id as string} not found`)
            items[index] = item
          })
          removed.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            /* istanbul ignore if -- @preserve */
            if (index === -1) throw new Error(`Item with ID ${item.id as string} not found`)
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
