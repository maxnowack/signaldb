import { describe, it, expect, beforeEach } from 'vitest'
import prepareIndexedDB from '../src'

type Item = { id: number, name?: string, value?: string, tag?: string }

class FakeStore {
  data = new Map<number, Item>()
  private indexNamesSet = new Set<string>()

  get indexNames() {
    const names = [...this.indexNamesSet]
    return {
      contains: (name: string) => this.indexNamesSet.has(name),
      item: (index: number) => names[index] ?? null,
      length: names.length,
    }
  }

  createIndex(name: string) {
    this.indexNamesSet.add(name)
  }

  deleteIndex(name: string) {
    this.indexNamesSet.delete(name)
  }

  private makeRequest(init: () => void, resultGetter?: () => any, shouldError?: boolean) {
    const listeners: Record<string, ((event: any) => void)[]> = {}
    const request: any = {
      addEventListener(type: string, callback: (event: any) => void) {
        (listeners[type] ||= []).push(callback)
      },
      error: shouldError ? { message: 'Test error' } : null,
    }
    if (resultGetter) {
      Object.defineProperty(request, 'result', { get: resultGetter })
    }
    queueMicrotask(() => {
      init()
      if (shouldError) {
        for (const callback of listeners.error || []) callback({})
      } else {
        for (const callback of listeners.success || []) callback({})
      }
    })
    return request
  }

  getAll() {
    return this.makeRequest(() => {}, () => [...this.data.values()])
  }

  get(id: number) {
    return this.makeRequest(() => {}, () => this.data.get(id) ?? null)
  }

  add(item: Item) {
    return this.makeRequest(() => {
      if (this.data.has(item.id)) {
        throw new Error('Item already exists')
      }
      this.data.set(item.id, item)
    })
  }

  put(item: Item) {
    return this.makeRequest(() => {
      this.data.set(item.id, item)
    })
  }

  delete(id: number) {
    return this.makeRequest(() => {
      this.data.delete(id)
    })
  }

  clear() {
    return this.makeRequest(() => {
      this.data.clear()
    })
  }

  index(field: string) {
    const entries = [...this.data.values()].map(v => ({ key: (v as any)[field], value: v }))
    return {
      openCursor: () => {
        const listeners: Record<string, ((event: any) => void)[]> = {}
        let current: any = null
        const request: any = {
          addEventListener(type: string, callback: (event: any) => void) {
            (listeners[type] ||= []).push(callback)
          },
        }
        Object.defineProperty(request, 'result', { get: () => current })
        let i = 0
        const emitSuccess = () => {
          if (i < entries.length) {
            const entry = entries[i++]
            current = {
              key: entry.key,
              value: entry.value,
              continue: () => queueMicrotask(emitSuccess),
            }
          } else {
            current = null
          }
          for (const callback of listeners.success || []) callback({})
        }
        queueMicrotask(emitSuccess)
        return request
      },
    }
  }

  // Add error-triggering version
  makeErrorRequest() {
    return this.makeRequest(() => {}, undefined, true)
  }
}

class FakeDB {
  private storeMap = new Map<string, FakeStore>()
  private names = new Set<string>()
  version = 1

  get objectStoreNames() {
    const names = [...this.names]
    return {
      contains: (name: string) => this.names.has(name),
      item: (index: number) => names[index] ?? null,
      length: names.length,
    }
  }

  createObjectStore(name: string) {
    this.names.add(name)
    if (!this.storeMap.has(name)) this.storeMap.set(name, new FakeStore())
    return this.storeMap.get(name) as FakeStore
  }

  deleteObjectStore(name: string) {
    this.names.delete(name)
    this.storeMap.delete(name)
  }

  transaction(name: string) {
    if (!this.storeMap.has(name)) this.createObjectStore(name)
    return { objectStore: () => this.storeMap.get(name) as FakeStore } as any
  }

  close() {}

  getStore(name: string) {
    if (!this.storeMap.has(name)) this.createObjectStore(name)
    return this.storeMap.get(name) as FakeStore
  }
}

class FakeOpenRequest {
  result!: FakeDB
  transaction!: { objectStore: (name: string) => FakeStore }
  error: Error | null = null
  private listeners: Record<string, ((event: any) => void)[]> = {}

  addEventListener(type: string, callback: (event: any) => void) {
    (this.listeners[type] ||= []).push(callback)
  }

  dispatch(type: string, event: any) {
    (this.listeners[type] || []).forEach(fn => fn(event))
  }
}

let database: FakeDB

beforeEach(() => {
  database = new FakeDB()
  const openFunction = (_name: string, version?: number) => {
    const request = new FakeOpenRequest()
    database.version = version || 1
    queueMicrotask(() => {
      request.result = database
      request.transaction = {
        objectStore: (name: string) => database.getStore(name),
      }
      request.dispatch('upgradeneeded', { oldVersion: 0, newVersion: version || 1 })
      request.dispatch('success', {})
    })
    return request as any
  }
  ;(globalThis as any).indexedDB = { open: openFunction }
})

describe('indexeddb adapter comprehensive coverage', () => {
  it('should handle database opening with version', async () => {
    const prepare = prepareIndexedDB({
      version: 2,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()
    expect(database.version).toBe(2)
  })

  it('should use default database name when not provided', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()
    // Default name 'signaldb' should be used
    expect(adapter).toBeDefined()
  })

  it('should call onUpgrade callback during database upgrade', async () => {
    let upgradeCalled = false
    // Ensure the store gets created during upgrade
    database.createObjectStore('items')

    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: ['name'] },
      onUpgrade: async (_database, _tx, oldVersion, newVersion) => {
        upgradeCalled = true
        expect(oldVersion).toBe(0)
        expect(newVersion).toBe(1)
      },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()
    expect(upgradeCalled).toBe(true)
  })

  it('should delete stores not in schema during upgrade', async () => {
    // First create with a store
    database.createObjectStore('old-store')
    database.createObjectStore('keep-store')

    const prepare = prepareIndexedDB({
      databaseName: 'delete-stores-test',
      version: 1,
      schema: { 'keep-store': [] }, // Only keep-store in schema
    })
    const adapter = prepare<Item, number>('keep-store')
    await adapter.setup()

    expect(database.objectStoreNames.contains('keep-store')).toBe(true)
    expect(database.objectStoreNames.contains('old-store')).toBe(false)
  })

  it('should create new stores from schema', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: {
        'new-store': ['name'],
        'another-store': [],
      },
    })
    const adapter1 = prepare<Item, number>('new-store')
    const adapter2 = prepare<Item, number>('another-store')

    await adapter1.setup()
    await adapter2.setup()

    expect(database.objectStoreNames.contains('new-store')).toBe(true)
    expect(database.objectStoreNames.contains('another-store')).toBe(true)
  })

  it('should create indices from schema', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: ['name', 'tag'] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    const store = database.getStore('items')
    expect(store.indexNames.contains('name')).toBe(true)
    expect(store.indexNames.contains('tag')).toBe(true)
  })

  it('should skip creating index for id field', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: ['id', 'name'] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    const store = database.getStore('items')
    expect(store.indexNames.contains('id')).toBe(false) // id should be skipped
    expect(store.indexNames.contains('name')).toBe(true)
  })

  it('should delete indices not in schema', async () => {
    const store = database.createObjectStore('items')
    store.createIndex('old-index')
    store.createIndex('keep-index')

    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: ['keep-index'] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    expect(store.indexNames.contains('keep-index')).toBe(true)
    expect(store.indexNames.contains('old-index')).toBe(false)
  })

  it('should skip creating index if it already exists', async () => {
    const store = database.createObjectStore('items')
    store.createIndex('existing')

    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: ['existing'] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    expect(store.indexNames.contains('existing')).toBe(true)
  })

  it('should throw error when store does not exist in schema', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { 'other-store': [] },
    })
    const adapter = prepare<Item, number>('non-existent-store')

    await expect(adapter.setup()).rejects.toThrow('does not exist in database')
  })

  it('should perform readAll operation', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ])

    const all = await adapter.readAll()
    expect(all.length).toBe(2)
    expect(all.map(i => i.id).toSorted()).toEqual([1, 2])
  })

  it('should perform readIds operation', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
      { id: 3, name: 'charlie' },
    ])

    const items = await adapter.readIds([1, 3])
    expect(items.length).toBe(2)
    expect(items.map(i => i.id).toSorted()).toEqual([1, 3])
  })

  it('should filter out null results when reading ids', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([{ id: 1, name: 'alice' }])

    const items = await adapter.readIds([1, 999]) // 999 doesn't exist
    expect(items.length).toBe(1)
    expect(items[0].id).toBe(1)
  })

  it('should read index and return map of values to id sets', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: ['tag'] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([
      { id: 1, tag: 'red' },
      { id: 2, tag: 'blue' },
      { id: 3, tag: 'red' },
    ])

    const index = await adapter.readIndex('tag')
    expect(index.get('red')?.has(1)).toBe(true)
    expect(index.get('red')?.has(3)).toBe(true)
    expect(index.get('blue')?.has(2)).toBe(true)
  })

  it('should throw error when reading non-existent index', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await expect(adapter.readIndex('nonexistent')).rejects.toThrow('does not exist')
  })

  it('should handle createIndex as noop', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    // createIndex should not throw
    await expect(adapter.createIndex('anything')).resolves.toBeUndefined()
  })

  it('should handle dropIndex as noop', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    // dropIndex should not throw
    await expect(adapter.dropIndex('anything')).resolves.toBeUndefined()
  })

  it('should insert items', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([{ id: 1, name: 'test' }])

    const all = await adapter.readAll()
    expect(all.length).toBe(1)
    expect(all[0].name).toBe('test')
  })

  it('should replace items', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([{ id: 1, name: 'old' }])
    await adapter.replace([{ id: 1, name: 'new' }])

    const items = await adapter.readIds([1])
    expect(items[0].name).toBe('new')
  })

  it('should remove items', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([{ id: 1, name: 'test' }, { id: 2, name: 'test2' }])
    await adapter.remove([{ id: 1 }])

    const all = await adapter.readAll()
    expect(all.length).toBe(1)
    expect(all[0].id).toBe(2)
  })

  it('should removeAll items', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await adapter.insert([{ id: 1 }, { id: 2 }, { id: 3 }])
    await adapter.removeAll()

    const all = await adapter.readAll()
    expect(all.length).toBe(0)
  })

  it('should close database on teardown', async () => {
    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')
    await adapter.setup()

    await expect(adapter.teardown()).resolves.toBeUndefined()
    // teardown should call database.close()
  })

  it('should handle database not initialized error', async () => {
    // Create a broken setup where database promise rejects
    const brokenOpenFunction = () => {
      const request = new FakeOpenRequest()
      queueMicrotask(() => {
        request.result = null as any
        request.dispatch('success', {})
      })
      return request as any
    }
    ;(globalThis as any).indexedDB = { open: brokenOpenFunction }

    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')

    // Any operation should fail
    await expect(adapter.readAll()).rejects.toThrow('Database not initialized')
  })

  it('should handle database open error', async () => {
    const errorOpenFunction = () => {
      const request = new FakeOpenRequest()
      queueMicrotask(() => {
        request.error = new Error('Open failed')
        request.dispatch('error', {})
      })
      return request as any
    }
    ;(globalThis as any).indexedDB = { open: errorOpenFunction }

    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
    })
    const adapter = prepare<Item, number>('items')

    await expect(adapter.setup()).rejects.toThrow()
  })

  it('should handle onUpgrade error', async () => {
    const errorOpenFunction = (_name: string, _version?: number) => {
      const request = new FakeOpenRequest()
      queueMicrotask(() => {
        request.result = database
        request.transaction = {
          objectStore: (name: string) => database.getStore(name),
        }
        request.dispatch('upgradeneeded', { oldVersion: 0, newVersion: _version || 1 })
        // Trigger error after upgradeneeded
        request.error = new Error('Upgrade failed')
        request.dispatch('error', {})
      })
      return request as any
    }
    ;(globalThis as any).indexedDB = { open: errorOpenFunction }

    const prepare = prepareIndexedDB({
      version: 1,
      schema: { items: [] },
      onUpgrade: async () => {
        throw new Error('Upgrade failed')
      },
    })
    const adapter = prepare<Item, number>('items')

    await expect(adapter.setup()).rejects.toThrow()
  })
})
