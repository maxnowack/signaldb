/* eslint-disable @typescript-eslint/no-unused-vars, @stylistic/brace-style, @stylistic/max-statements-per-line, unicorn/prevent-abbreviations */
import { describe, it, expect, beforeEach } from 'vitest'
import createIndexedDBAdapter from '../src'

type Item = { id: number, name?: string }

// Minimal in-memory IndexedDB mock sufficient for adapter paths
class Store {
  data = new Map<number, Item>()

  private names = new Set<string>()

  indexNames = {
    contains: (name: string) => this.names.has(name),
  }

  createIndex(name: string) {
    this.names.add(name)
  }

  deleteIndex(name: string) {
    this.names.delete(name)
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
      openCursor() {
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
            const cursor = {
              key: cur.key,
              value: cur.value,
              continue: () => queueMicrotask(emitSuccess),
            }
            current = cursor
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
  private names = new Set<string>()

  objectStoreNames = {
    contains: (name: string) => this.names.has(name),
  }

  private store = new Store()

  close() {}

  createObjectStore(name: string) {
    this.names.add(name)
    return this.store
  }

  transaction(_name: string, _mode: 'readonly' | 'readwrite') {
    return { objectStore: () => this.store } as any
  }

  getStore() { return this.store }
}

class OpenRequest {
  result!: FakeDB

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
      ;(req as any).transaction = { objectStore: () => db.getStore() }
      req.dispatch('upgradeneeded', { oldVersion: 0, newVersion: 1 })
      req.dispatch('success', {})
    })
    return req as any
  }
  openSpy = openFn
  ;(globalThis as any).indexedDB = { open: openSpy }
})

describe('indexeddb adapter', () => {
  it('covers setup, CRUD and index paths', async () => {
    const adapter = createIndexedDBAdapter<Item, number>('items', { databaseName: 'signaldb' })

    // define indexes before setup
    await adapter.createIndex('name')
    await adapter.dropIndex('tag')
    await adapter.setup()

    // CRD + readAll/Ids
    await adapter.insert([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
    await adapter.replace([{ id: 2, name: 'bb' }])
    const all = await adapter.readAll()
    expect(all.length).toBe(2)
    const ids = await adapter.readIds([2])
    expect(ids.map(i => i.id)).toEqual([2])

    // index read (uses openCursor)
    const idx = await adapter.readIndex('name')
    expect(idx.get('a')).toBeDefined()
    expect(idx.get('bb')).toBeDefined()

    await adapter.remove([{ id: 1 } as Item])
    await adapter.removeAll()

    await adapter.teardown()
  })
})
