/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach } from 'vitest'
import prepareIndexedDB from '../src'

type Item = { id: number, name?: string }

// Minimal in-memory IndexedDB mock sufficient for adapter paths
class Store {
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

  private makeRequest(init: () => void, resultGetter?: () => any) {
    const listeners: Record<string, ((e: any) => void)[]> = {}
    const req: any = {
      addEventListener(type: string, cb: (e: any) => void) {
        (listeners[type] ||= []).push(cb)
      },
    }
    if (resultGetter) {
      Object.defineProperty(req, 'result', { get: resultGetter })
    }
    queueMicrotask(() => {
      init()
      for (const cb of listeners.success || []) cb({})
    })
    return req
  }

  getAll() {
    return this.makeRequest(() => {}, () => [...this.data.values()])
  }

  get(id: number) {
    return this.makeRequest(() => {}, () => this.data.get(id) ?? null)
  }

  add(item: Item) {
    return this.makeRequest(() => { this.data.set(item.id, item) })
  }

  put(item: Item) {
    return this.makeRequest(() => { this.data.set(item.id, item) })
  }

  delete(id: number) {
    return this.makeRequest(() => { this.data.delete(id) })
  }

  clear() {
    return this.makeRequest(() => { this.data.clear() })
  }

  index(field: string) {
    const entries = [...this.data.values()].map(v => ({ key: (v as any)[field], value: v }))
    return {
      openCursor: () => {
        const listeners: Record<string, ((e: any) => void)[]> = {}
        let current: any = null
        const req: any = {
          addEventListener(type: string, cb: (e: any) => void) {
            (listeners[type] ||= []).push(cb)
          },
        }
        Object.defineProperty(req, 'result', { get: () => current })
        let i = 0
        const emitSuccess = () => {
          if (i < entries.length) {
            const cur = entries[i++]
            current = {
              key: cur.key,
              value: cur.value,
              continue: () => queueMicrotask(emitSuccess),
            }
          } else {
            current = null
          }
          for (const cb of listeners.success || []) cb({})
        }
        queueMicrotask(emitSuccess)
        return req
      },
    }
  }
}

class FakeDB {
  private storeMap = new Map<string, Store>()
  private names = new Set<string>()

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
    if (!this.storeMap.has(name)) this.storeMap.set(name, new Store())
    return this.storeMap.get(name) as Store
  }

  transaction(name: string, _mode: 'readonly' | 'readwrite') {
    if (!this.storeMap.has(name)) this.createObjectStore(name)
    return { objectStore: () => this.storeMap.get(name) as Store } as any
  }

  close() {}

  getStore(name: string) {
    if (!this.storeMap.has(name)) this.createObjectStore(name)
    return this.storeMap.get(name) as Store
  }
}

class OpenRequest {
  result!: FakeDB
  transaction!: { objectStore: (name: string) => Store }
  private listeners: Record<string, ((e: any) => void)[]> = {}

  addEventListener(type: string, callback: (e: any) => void) {
    (this.listeners[type] ||= []).push(callback)
  }

  dispatch(type: string, event: any) {
    (this.listeners[type] || []).forEach(fn => fn(event))
  }
}

let db: FakeDB
let openSpy: any

beforeEach(() => {
  db = new FakeDB()
  const openFn = (_name: string, _version?: number) => {
    const req = new OpenRequest()
    queueMicrotask(() => {
      req.result = db
      req.transaction = {
        objectStore: (name: string) => db.getStore(name),
      }
      req.dispatch('upgradeneeded', { oldVersion: 0, newVersion: 1 })
      req.dispatch('success', {})
    })
    return req as any
  }
  openSpy = openFn
  ;(globalThis as any).indexedDB = { open: openSpy }
})

describe('indexeddb adapter', () => {
  it('sets up schema and performs CRUD with index reads', async () => {
    const prepare = prepareIndexedDB({
      databaseName: 'signaldb',
      version: 1,
      schema: { items: ['name'] },
    })
    const adapter = prepare<Item, number>('items')

    await adapter.setup()
    await adapter.insert([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ])

    const all = await adapter.readAll()
    expect(all.map(i => i.id)).toEqual([1, 2])

    const index = await adapter.readIndex('name')
    expect(index.get('alice')?.has(1)).toBe(true)
    expect(index.get('bob')?.has(2)).toBe(true)

    await adapter.remove([{ id: 1 }])
    await adapter.removeAll()
    await adapter.teardown()
  })

  it('removes indexes that disappear from schema on upgrade', async () => {
    const dbName = 'signaldb-upgrade'
    const coll = 'items'

    // Initial schema with index
    {
      const prepare = prepareIndexedDB({
        databaseName: dbName,
        version: 1,
        schema: { [coll]: ['name'] },
      })
      const adapter = prepare<Item, number>(coll)
      await adapter.setup()
      await adapter.insert([{ id: 1, name: 'alice' }])
      const index = await adapter.readIndex('name')
      expect(index.get('alice')?.has(1)).toBe(true)
      await adapter.teardown()
    }

    // Upgrade without index should drop prior index files
    {
      const prepare = prepareIndexedDB({
        databaseName: dbName,
        version: 2,
        schema: { [coll]: [] },
      })
      const adapter = prepare<Item, number>(coll)
      await adapter.setup()
      await expect(adapter.readIndex('name')).rejects.toThrow('does not exist')
      await adapter.teardown()
    }
  })
})
