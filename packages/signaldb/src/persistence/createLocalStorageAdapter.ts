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
    async save(_items, { added, modified, removed }) {
      const items = getItems()
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
      localStorage.setItem(collectionId, JSON.stringify(items))
      return Promise.resolve()
    },
    async register() {
      return Promise.resolve()
    },
  })
}
