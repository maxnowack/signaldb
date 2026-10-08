import type StorageAdapter from '../types/StorageAdapter'
import get from './get'
import serializeValue from './serializeValue'

/**
 * Creates a storage adapter that keeps its items in memory, for data adapters that need a
 * storage adapter but were given none. Nothing survives a reload.
 * @template T - The type of the items.
 * @template I - The type of the items' ids.
 * @returns The storage adapter.
 */
export default function createMemoryStorageAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(): StorageAdapter<T, I> {
  const items = new Map<I, T>()
  const indexedFields = new Set<string>()

  const write = (newItems: T[]) => {
    for (const item of newItems) items.set(item.id, item)
    return Promise.resolve()
  }

  return {
    setup: () => Promise.resolve(),
    teardown: () => Promise.resolve(),
    readAll: () => Promise.resolve([...items.values()]),
    readIds: ids => Promise.resolve(ids.flatMap((id) => {
      const item = items.get(id)
      return item ? [item] : []
    })),

    createIndex: (field) => {
      indexedFields.add(field)
      return Promise.resolve()
    },
    dropIndex: (field) => {
      indexedFields.delete(field)
      return Promise.resolve()
    },
    readIndex: (field) => {
      if (!indexedFields.has(field)) {
        return Promise.reject(new Error(`Index on field "${field}" does not exist`))
      }
      const index = new Map<string | null, Set<I>>()
      items.forEach((item) => {
        const key = serializeValue(get(item, field))
        if (!index.has(key)) index.set(key, new Set())
        index.get(key)?.add(item.id)
      })
      return Promise.resolve(index)
    },

    insert: write,
    replace: write,
    remove: (oldItems) => {
      for (const item of oldItems) items.delete(item.id)
      return Promise.resolve()
    },
    removeAll: () => {
      items.clear()
      return Promise.resolve()
    },
  }
}
