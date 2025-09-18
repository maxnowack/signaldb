import { describe, it, expect } from 'vitest'
import AsyncDataAdapter from '../src/AsyncDataAdapter'

// Mock storage adapter
const mockStorage = () => ({
  setup: () => Promise.resolve(),
  teardown: () => Promise.resolve(),
  readAll: () => Promise.resolve([]),
  readIds: () => Promise.resolve([]),
  createIndex: () => Promise.resolve(),
  dropIndex: () => Promise.resolve(),
  readIndex: () => Promise.resolve(new Map()),
  insert: () => Promise.resolve(),
  replace: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  removeAll: () => Promise.resolve(),
})

describe('AsyncDataAdapter Basic Coverage', () => {
  it('should create adapter with id', () => {
    const adapter = new AsyncDataAdapter({
      storage: mockStorage,
      id: 'test',
    })
    expect(adapter).toBeDefined()
  })

  it('should create adapter without id', () => {
    const adapter = new AsyncDataAdapter({
      storage: mockStorage,
    })
    expect(adapter).toBeDefined()
  })

  it('should create collection backend', () => {
    const adapter = new AsyncDataAdapter({
      storage: mockStorage,
      id: 'test',
    })

    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    expect(backend).toBeDefined()
    expect(backend.insert).toBeDefined()
    expect(backend.updateOne).toBeDefined()
    expect(backend.updateMany).toBeDefined()
    expect(backend.replaceOne).toBeDefined()
    expect(backend.removeOne).toBeDefined()
    expect(backend.removeMany).toBeDefined()
    expect(backend.registerQuery).toBeDefined()
    expect(backend.unregisterQuery).toBeDefined()
    expect(backend.getQueryState).toBeDefined()
    expect(backend.getQueryError).toBeDefined()
    expect(backend.getQueryResult).toBeDefined()
    expect(backend.onQueryStateChange).toBeDefined()
    expect(backend.dispose).toBeDefined()
    expect(backend.isReady).toBeDefined()
  })

  it('should handle query operations', () => {
    const adapter = new AsyncDataAdapter({
      storage: mockStorage,
    })
    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    const selector = { name: 'test' }
    const options = { limit: 10 }

    // These should not throw and return expected defaults
    backend.registerQuery(selector, options)
    expect(backend.getQueryState(selector, options)).toBe('active')
    expect(backend.getQueryError(selector, options)).toBeNull()
    expect(backend.getQueryResult(selector, options)).toEqual([])
    backend.unregisterQuery(selector, options)
  })

  it('should handle query state change listener', () => {
    const adapter = new AsyncDataAdapter({
      storage: mockStorage,
    })
    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    const callback = () => {}
    const unsubscribe = backend.onQueryStateChange({ name: 'test' }, {}, callback)

    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('should handle operations', async () => {
    const adapter = new AsyncDataAdapter({
      storage: mockStorage,
    })
    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    // These should not throw
    await expect(backend.dispose()).resolves.toBeUndefined()
    await expect(backend.isReady()).resolves.toBeUndefined()
  })
})
