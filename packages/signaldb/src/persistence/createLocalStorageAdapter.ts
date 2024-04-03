import createPersistenceAdapter from './createPersistenceAdapter'

export default function createLocalStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(name: string) {
  const collectionId = `signaldb-collection-${name}`
  function getItems(): T[] {
    return JSON.parse(localStorage.getItem(collectionId) || '[]')
  }
  return createPersistenceAdapter<T, I>({
    async load() {
      const items = getItems()
      return Promise.resolve({ items })
    },
    async save(items, { added, modified, removed }) {
      if (added.length === 0 && modified.length === 0 && removed.length === 0) {
        localStorage.setItem(collectionId, JSON.stringify(items))
        return Promise.resolve()
      }
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
      localStorage.setItem(collectionId, JSON.stringify(currentItems))
      return Promise.resolve()
    },
    async register() {
      return Promise.resolve()
    },
  })
}
