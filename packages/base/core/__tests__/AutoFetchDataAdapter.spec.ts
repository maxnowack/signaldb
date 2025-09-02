import { describe, it, expect } from 'vitest'
import { Collection, AutoFetchDataAdapter } from '../src'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

type Post = { id: string, title?: string, type?: string }

describe('AutoFetchDataAdapter', () => {
  it('sets up storage and indices on ready', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })

    const col = new Collection<Post>('posts', adapter, { indices: ['type'] })
    await col.ready()

    // indices should exist (no throw)
    await expect(storage.readIndex('id')).resolves.toBeInstanceOf(Map)
    await expect(storage.readIndex('type')).resolves.toBeInstanceOf(Map)
  })

  it('auto-fetches and stores items on first async query', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const remote: Post[] = [
      { id: '1', title: 'A', type: 'x' },
      { id: '2', title: 'B', type: 'y' },
    ]

    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => remote,
    })

    const col = new Collection<Post>('posts', adapter, { indices: ['type'] })
    await col.ready()

    // First async fetch resolves local snapshot (empty), remote ingest happens afterwards
    const first = await col.find<true>({}, { async: true }).fetch()
    expect(first).toEqual([])
    // Allow auto-fetch to complete and ingest results
    await Promise.resolve()
    const all = await col.find<true>({}, { async: true }).fetch()
    expect(all).toEqual(remote)

    const only2 = await col.find<true>({ id: '2' }, { async: true }).fetch()
    expect(only2).toEqual([{ id: '2', title: 'B', type: 'y' }])

    const inStorage = await storage.readAll()
    expect(inStorage).toHaveLength(2)
  })

  it('supports CRUD via collection and reflects in async queries', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })

    const col = new Collection<Post>('posts', adapter, { indices: ['type'] })
    await col.ready()

    const id = await col.insert({ id: 'p1', title: 'Hello', type: 'x' })
    expect(id).toBe('p1')

    await col.updateOne({ id }, { $set: { title: 'World' } })
    let item = await col.find<true>({ id }, { async: true }).fetch()
    expect(item).toEqual([{ id: 'p1', title: 'World', type: 'x' }])

    await col.replaceOne({ id }, { title: 'Replaced' })
    item = await col.find<true>({ id }, { async: true }).fetch()
    expect(item).toEqual([{ id: 'p1', title: 'Replaced' }])

    await col.removeOne({ id })
    const empty = await col.find<true>({ id }, { async: true }).fetch()
    expect(empty).toEqual([])
  })

  it('purges auto-fetched items after unregister when purgeDelay=0', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const remote: Post[] = [{ id: '1', title: 'Keep me around' }]
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => remote,
      purgeDelay: 0,
    })

    const col = new Collection<Post>('posts', adapter)
    await col.ready()

    // Keep a persistent observer so fetch can complete before we unregister
    const cursor = col.find({})
    cursor.forEach(() => { /* keep observer active */ })
    // let auto-fetch ingest and query state cycle to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    // now dispose observer to unregister query and trigger purge
    cursor.cleanup()
    await new Promise(resolve => setTimeout(resolve, 0))
    const itemsAfterPurge = await storage.readAll()
    expect(itemsAfterPurge).toEqual([])
  })
})
