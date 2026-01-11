import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import createLocalStorageAdapter from '../src/index'

interface Item {
  id: string,
  name: string,
}

class FakeLocalStorage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key) as string : null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }
}

describe('localStorage adapter', () => {
  const originalStorage = globalThis.localStorage

  beforeEach(() => {
    globalThis.localStorage = new FakeLocalStorage() as unknown as Storage
  })

  afterEach(() => {
    globalThis.localStorage = originalStorage
  })

  it('throws when localStorage is unavailable', () => {
    globalThis.localStorage = undefined as unknown as Storage
    expect(() => createLocalStorageAdapter<Item, string>('missing')).toThrow('localStorage is not available in this environment')
  })

  it('performs CRUD and maintains indices', async () => {
    const adapter = createLocalStorageAdapter<Item, string>('items', { databaseName: 'db' })
    await adapter.setup()
    await adapter.insert([
      { id: '1', name: 'alpha' },
      { id: '2', name: 'beta' },
    ])

    const allItems = await adapter.readAll()
    expect(allItems.length).toBe(2)
    await adapter.createIndex('name')
    let index = await adapter.readIndex('name')
    expect(index.get('alpha')).toEqual(new Set(['1']))

    await adapter.replace([{ id: '1', name: 'alpha-updated' }])
    index = await adapter.readIndex('name')
    expect(index.get('alpha')).toBeUndefined()
    expect(index.get('alpha-updated')).toEqual(new Set(['1']))

    await adapter.remove([{ id: '2', name: 'beta' }])
    index = await adapter.readIndex('name')
    expect(index.get('beta')).toBeUndefined()

    await adapter.removeAll()
    expect(await adapter.readAll()).toEqual([])
  })

  it('fails when reading a corrupted index', async () => {
    const adapter = createLocalStorageAdapter<Item, string>('corrupt')
    await adapter.setup()
    await adapter.createIndex('name')
    globalThis.localStorage.setItem('signaldb-corrupt-index-name', 'not json')
    await expect(adapter.readIndex('name')).rejects.toThrow('Corrupted index on field "name"')
  })
})
