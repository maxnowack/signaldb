import { describe, it, expect } from 'vitest'
import createMemoryStorageAdapter from './createMemoryStorageAdapter'

type Item = { id: string, author?: { name: string } }

describe('createMemoryStorageAdapter', () => {
  it('stores, replaces and removes items', async () => {
    const storage = createMemoryStorageAdapter<Item, string>()
    await storage.setup()
    await storage.insert([{ id: '1' }, { id: '2' }])
    await storage.replace([{ id: '1', author: { name: 'Ada' } }])
    expect(await storage.readIds(['1', 'missing'])).toEqual([{ id: '1', author: { name: 'Ada' } }])

    await storage.remove([{ id: '1' }])
    expect(await storage.readAll()).toEqual([{ id: '2' }])
    await storage.removeAll()
    expect(await storage.readAll()).toEqual([])
    await storage.teardown()
  })

  it('answers an index by the serialized value of a nested field', async () => {
    const storage = createMemoryStorageAdapter<Item, string>()
    await storage.createIndex('author.name')
    await storage.insert([{ id: '1', author: { name: 'Ada' } }, { id: '2' }])

    const index = await storage.readIndex('author.name')
    expect(index.get('Ada')).toEqual(new Set(['1']))
    expect(index.get(null)).toEqual(new Set(['2']))
  })

  it('refuses to read an index that was not created or was dropped', async () => {
    const storage = createMemoryStorageAdapter<Item, string>()
    await expect(storage.readIndex('author.name')).rejects.toThrow('does not exist')
    await storage.createIndex('author.name')
    await storage.dropIndex('author.name')
    await expect(storage.readIndex('author.name')).rejects.toThrow('does not exist')
  })
})
