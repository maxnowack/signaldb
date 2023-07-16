import type PersistenceAdapter from '../types/PersistenceAdapter'

export default function createLocalStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(name: string): PersistenceAdapter<T, I> {
  const id = `signaldb-collection-${name}`
  return {
    async load() {
      const items = JSON.parse(localStorage.getItem(id) || '[]')
      return Promise.resolve({ items })
    },
    async save(items) {
      localStorage.setItem(id, JSON.stringify(items))
      return Promise.resolve()
    },
    async register() {
      return Promise.resolve()
    },
  }
}
