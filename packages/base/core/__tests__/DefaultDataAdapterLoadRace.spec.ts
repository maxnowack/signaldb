import { describe, it, expect } from 'vitest'
import { Collection, DefaultDataAdapter } from '../src'
import type StorageAdapter from '../src/types/StorageAdapter'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

type Item = { id: string, value: number }

/**
 * Wraps a storage adapter so that a write can be made while a `readAll` is in flight: after
 * storage has been read, before the result reaches the collection.
 * @param storage - The storage adapter to wrap.
 * @returns The wrapped storage adapter, and `duringNextRead` to register the write.
 */
function withReadHook(storage: StorageAdapter<Item, string>) {
  let hook: (() => void) | undefined
  const adapter: StorageAdapter<Item, string> = {
    ...storage,
    readAll: async () => {
      const items = await storage.readAll()
      const currentHook = hook
      hook = undefined
      currentHook?.()
      return items
    },
  }
  return {
    adapter,
    duringNextRead: (callback: () => void) => {
      hook = callback
    },
  }
}

/**
 * Creates a collection persisted to a memory storage adapter whose reads can be interleaved.
 * @param name - The collection name.
 * @param initialData - The items storage holds before the collection is created.
 * @returns The collection, the underlying storage, its data adapter and the read hook.
 */
function setup(name: string, initialData: Item[]) {
  const storage = memoryStorageAdapter<Item, string>(initialData)
  const { adapter, duringNextRead } = withReadHook(storage)
  const dataAdapter = new DefaultDataAdapter({ storage: () => adapter })
  const collection = new Collection<Item, string>(name, dataAdapter)
  return { collection, storage, dataAdapter, duringNextRead }
}

/**
 * Inserts an item and then increments its value, as two separate writes.
 * @param collection - The collection to write to.
 */
async function insertAndIncrement(collection: Collection<Item, string>) {
  await collection.insert({ id: 'written', value: 1 })
  await collection.updateOne({ id: 'written' }, { $inc: { value: 1 } })
}

describe('DefaultDataAdapter writes during a load from storage', () => {
  it('keeps an item inserted while the first readAll is in flight', async () => {
    const { collection, storage, duringNextRead } = setup('insert-first-load', [
      { id: 'stored', value: 1 },
    ])
    let write: Promise<unknown> | undefined
    duringNextRead(() => {
      write = collection.insert({ id: 'written', value: 1 })
    })
    await collection.ready()
    await write

    const storedItems = await storage.readAll()
    expect(storedItems.map(item => item.id)).toEqual(['stored', 'written'])
    expect(await collection.find({}, { async: true, sort: { id: 1 } }).fetch())
      .toEqual([{ id: 'stored', value: 1 }, { id: 'written', value: 1 }])
    await expect(collection.insert({ id: 'written', value: 2 }))
      .rejects.toThrow('Item with id \'written\' already exists')
  })

  it('keeps an item inserted and updated while the first readAll is in flight', async () => {
    const { collection, storage, duringNextRead } = setup('update-first-load', [])
    let write: Promise<unknown> | undefined
    duringNextRead(() => {
      write = insertAndIncrement(collection)
    })
    await collection.ready()
    await write

    expect(await storage.readAll()).toEqual([{ id: 'written', value: 2 }])
    expect(await collection.find({}, { async: true }).fetch()).toEqual([{ id: 'written', value: 2 }])
  })

  it('applies an update that storage already holds once, not twice', async () => {
    const { collection, storage } = setup('update-before-read', [])
    const write = insertAndIncrement(collection)
    await collection.ready()
    await write

    expect(await storage.readAll()).toEqual([{ id: 'written', value: 2 }])
    expect(await collection.find({}, { async: true }).fetch()).toEqual([{ id: 'written', value: 2 }])
  })

  it('keeps an update made while a reload is in flight', async () => {
    const { collection, storage, dataAdapter, duringNextRead } = setup('update-reload', [
      { id: 'stored', value: 1 },
    ])
    await collection.ready()
    let write: Promise<unknown> | undefined
    duringNextRead(() => {
      write = collection.updateOne({ id: 'stored' }, { $inc: { value: 1 } })
    })
    await dataAdapter.fetchItemsFromStorage(collection)
    await write

    expect(await storage.readAll()).toEqual([{ id: 'stored', value: 2 }])
    expect(await collection.findOne({ id: 'stored' }, { async: true }))
      .toEqual({ id: 'stored', value: 2 })
  })

  it('keeps an item removed while a reload is in flight removed', async () => {
    const { collection, storage, dataAdapter, duringNextRead } = setup('remove-reload', [
      { id: 'stored', value: 1 },
    ])
    await collection.ready()
    let write: Promise<unknown> | undefined
    duringNextRead(() => {
      write = collection.removeOne({ id: 'stored' })
    })
    await dataAdapter.fetchItemsFromStorage(collection)
    await write

    expect(await storage.readAll()).toEqual([])
    expect(await collection.findOne({ id: 'stored' }, { async: true })).toBeUndefined()
    expect(await collection.find({}, { async: true }).count()).toBe(0)
  })
})
