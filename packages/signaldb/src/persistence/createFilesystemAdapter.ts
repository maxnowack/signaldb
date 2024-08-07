import createPersistenceAdapter from './createPersistenceAdapter'

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

  async function getItems(): Promise<T[]> {
    const fs = await import('fs')
    const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
    if (!exists) return []
    const contents = await fs.promises.readFile(filename, 'utf8').catch((err) => {
      /* istanbul ignore next -- @preserve */
      if (err.code === 'ENOENT') return '[]'
      /* istanbul ignore next -- @preserve */
      throw err
    })
    return deserialize(contents)
  }

  return createPersistenceAdapter<T, I>({
    async register(onChange) {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const fs = await import('fs')
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) await fs.promises.writeFile(filename, '[]')
      fs.watch(filename, { encoding: 'utf8' }, () => {
        void onChange()
      })
    },
    async load() {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      if (savePromise) await savePromise
      const items = await getItems()
      return { items }
    },
    async save(_items, { added, modified, removed }) {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      if (savePromise) await savePromise
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
