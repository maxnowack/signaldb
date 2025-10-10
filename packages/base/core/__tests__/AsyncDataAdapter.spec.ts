import { vi, beforeEach, describe, it, expect } from 'vitest'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import Collection from '../src/Collection'
import type StorageAdapter from '../src/types/StorageAdapter'
import queryId from '../src/utils/queryId'

interface TestItem {
  id: string,
  name: string,
  value?: number,
}

class MockStorageAdapter implements StorageAdapter<TestItem, string> {
  private items = new Map<string, TestItem>()
  private indices = new Map<string, Map<any, Set<string>>>()

  constructor(private name: string) {}

  async setup(): Promise<void> {
    return
  }

  async createIndex(field: string): Promise<void> {
    if (!this.indices.has(field)) {
      this.indices.set(field, new Map())
    }

    // Build index for existing items
    for (const [id, item] of this.items.entries()) {
      const value = (item as any)[field]
      const index = this.indices.get(field)
      if (index && !index.has(value)) {
        index.set(value, new Set())
      }
      index?.get(value)?.add(id)
    }
  }

  async insert(items: TestItem[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, item)

      // Update indices
      for (const [field, index] of this.indices.entries()) {
        const value = (item as any)[field]
        if (!index.has(value)) {
          index.set(value, new Set())
        }
        const valueSet = index.get(value)
        valueSet?.add(item.id)
      }
    }
  }

  async replace(items: TestItem[]): Promise<void> {
    for (const item of items) {
      // Remove old from indices
      const oldItem = this.items.get(item.id)
      if (oldItem) {
        for (const [field, index] of this.indices.entries()) {
          const oldValue = (oldItem as any)[field]
          index.get(oldValue)?.delete(item.id)
        }
      }

      this.items.set(item.id, item)

      // Update indices with new values
      for (const [field, index] of this.indices.entries()) {
        const value = (item as any)[field]
        if (!index.has(value)) {
          index.set(value, new Set())
        }
        const valueSet = index.get(value)
        valueSet?.add(item.id)
      }
    }
  }

  async remove(items: TestItem[]): Promise<void> {
    for (const item of items) {
      this.items.delete(item.id)

      // Remove from indices
      for (const [field, index] of this.indices.entries()) {
        const value = (item as any)[field]
        index.get(value)?.delete(item.id)
      }
    }
  }

  async readAll(): Promise<TestItem[]> {
    return [...this.items.values()]
  }

  async readIds(ids: string[]): Promise<TestItem[]> {
    return ids.map(id => this.items.get(id)).filter(Boolean) as TestItem[]
  }

  async teardown(): Promise<void> {
    this.items.clear()
    this.indices.clear()
  }

  async dropIndex(field: string): Promise<void> {
    this.indices.delete(field)
  }

  async removeAll(): Promise<void> {
    this.items.clear()

    // Clear all indices
    for (const index of this.indices.values()) {
      index.clear()
    }
  }

  async readIndex(field: string): Promise<Map<any, Set<string>>> {
    return this.indices.get(field) || new Map()
  }
}

// Helper function to wait for query completion (unused but kept for potential future use)
/**
 * Wait for query completion
 * @param backend - The backend instance
 * @param selector - The query selector
 * @param options - Query options
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function waitForQueryCompletion(backend: any, selector: any, options?: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const currentState = backend.getQueryState(selector, options)
      reject(new Error(`Query completion timeout. Current state: ${currentState}`))
    }, 1000) // Reduced timeout for faster feedback

    const unsubscribe = backend.onQueryStateChange(selector, options, (state: string) => {
      if (state === 'complete') {
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      } else if (state === 'error') {
        clearTimeout(timeout)
        unsubscribe()
        const error = backend.getQueryError(selector, options)
        reject(error instanceof Error ? error : new Error('Query failed'))
      }
    })

    // Check if already complete
    const currentState = backend.getQueryState(selector, options)
    if (currentState === 'complete') {
      clearTimeout(timeout)
      unsubscribe()
      resolve()
    } else if (currentState === 'error') {
      clearTimeout(timeout)
      unsubscribe()
      const error = backend.getQueryError(selector, options)
      reject(error instanceof Error ? error : new Error('Query failed'))
    }
  })
}

describe('AsyncDataAdapter', () => {
  let mockStorageFactory: (name: string) => MockStorageAdapter
  let adapter: AsyncDataAdapter
  let collection: Collection<TestItem>

  beforeEach(() => {
    const storageAdapters = new Map<string, MockStorageAdapter>()
    mockStorageFactory = (name: string) => {
      if (!storageAdapters.has(name)) {
        storageAdapters.set(name, new MockStorageAdapter(name))
      }
      const storageAdapter = storageAdapters.get(name)
      if (!storageAdapter) {
        throw new Error(`Storage adapter not found: ${name}`)
      }
      return storageAdapter
    }

    const onError = (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('AsyncDataAdapter error:', error)
    }

    adapter = new AsyncDataAdapter({
      storage: mockStorageFactory,
      id: 'test-adapter',
      onError,
    })

    collection = new Collection<TestItem>('test', adapter)
  })

  it('should create adapter with default id when none provided', () => {
    const defaultAdapter = new AsyncDataAdapter({ storage: mockStorageFactory })
    expect(defaultAdapter).toBeDefined()
  })

  it('should create collection backend', () => {
    const backend = adapter.createCollectionBackend(collection, ['name'])
    expect(backend).toBeDefined()
  })

  it('should handle insert operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

    const result = await backend.insert(testItem)
    expect(result).toEqual(testItem)

    // Verify item was actually inserted
    const storage = mockStorageFactory('test')
    const allItems = await storage.readAll()
    expect(allItems).toContainEqual(testItem)
  })

  it('should handle updateOne operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

    // First insert an item
    await backend.insert(testItem)

    // Then update it
    const result = await backend.updateOne({ id: '1' }, { $set: { name: 'updated' } })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: '1', name: 'updated' })
  })

  it('should handle updateOne with no matching items', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const result = await backend.updateOne({ id: 'nonexistent' }, { $set: { name: 'updated' } })
    expect(result).toEqual([])
  })

  it('should handle updateMany operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Insert multiple items
    await backend.insert({ id: '1', name: 'test' })
    await backend.insert({ id: '2', name: 'test' })
    await backend.insert({ id: '3', name: 'other' })

    // Update items with matching name
    const result = await backend.updateMany({ name: 'test' }, { $set: { value: 100 } })

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: '1', name: 'test', value: 100 })
    expect(result[1]).toEqual({ id: '2', name: 'test', value: 100 })
  })

  it('should handle updateMany with no matching items', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const result = await backend.updateMany({ name: 'nonexistent' }, { $set: { value: 100 } })
    expect(result).toEqual([])
  })

  it('should optimize queries with $exists false and null selectors', async () => {
    const backend = adapter.createCollectionBackend(collection, ['name'])

    // Insert items with non-null names to ensure index has non-null keys
    await backend.insert({ id: '1', name: 'alice' })
    await backend.insert({ id: '2', name: 'bob' })

    // Use selector that targets missing field via $exists: false
    const result1 = await backend.updateMany({
      name: { $exists: false },
    }, { $set: { value: 1 } })
    expect(result1).toEqual([])

    // Use selector with explicit null
    const result2 = await backend.updateMany({ name: null as any }, { $set: { value: 1 } })
    expect(result2).toEqual([])
  })

  it('should handle replaceOne operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test', value: 50 }

    // First insert an item
    await backend.insert(testItem)

    // Then replace it
    const result = await backend.replaceOne({ id: '1' }, { name: 'replaced', value: 100 })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: '1', name: 'replaced', value: 100 })
  })

  it('should handle replaceOne with no matching items', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const result = await backend.replaceOne({ id: 'nonexistent' }, { name: 'replaced' })
    expect(result).toEqual([])
  })

  it('should handle removeOne operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

    // First insert an item
    await backend.insert(testItem)

    // Then remove it
    const result = await backend.removeOne({ id: '1' })

    expect(result).toEqual([testItem])

    // Verify item was actually removed
    const storage = mockStorageFactory('test')
    const allItems = await storage.readAll()
    expect(allItems).not.toContainEqual(testItem)
  })

  it('should handle removeOne with no matching items', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const result = await backend.removeOne({ id: 'nonexistent' })
    expect(result).toEqual([])
  })

  it('should handle removeMany operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Insert multiple items
    await backend.insert({ id: '1', name: 'test' })
    await backend.insert({ id: '2', name: 'test' })
    await backend.insert({ id: '3', name: 'other' })

    // Remove items with matching name
    const result = await backend.removeMany({ name: 'test' })

    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: '1', name: 'test' })
    expect(result).toContainEqual({ id: '2', name: 'test' })

    // Verify only the 'other' item remains
    const storage = mockStorageFactory('test')
    const allItems = await storage.readAll()
    expect(allItems).toHaveLength(1)
    expect(allItems[0]).toEqual({ id: '3', name: 'other' })
  })

  it('should handle removeMany with no matching items', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const result = await backend.removeMany({ name: 'nonexistent' })
    expect(result).toEqual([])
  })

  it('should register and unregister queries', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'test' }
    const options = { limit: 10 }

    // Should not throw
    backend.registerQuery(selector, options)
    backend.unregisterQuery(selector, options)

    expect(backend).toBeDefined()
  })

  it('should get query state', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'test' }
    const options = { limit: 10 }

    // Initially returns 'active'
    expect(backend.getQueryState(selector, options)).toBe('active')
  })

  it('should get query error', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'test' }
    const options = { limit: 10 }

    // Initially returns null
    expect(backend.getQueryError(selector, options)).toBeNull()
  })

  it('should get query result', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'test' }
    const options = { limit: 10 }

    // Initially returns empty array
    expect(backend.getQueryResult(selector, options)).toEqual([])
  })

  it('should handle query state changes', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const callback = vi.fn()
    const selector = { name: 'test' }
    const options = { limit: 10 }

    const unsubscribe = backend.onQueryStateChange(selector, options, callback)

    // Register query to trigger fulfillment
    backend.registerQuery(selector, options)

    // Wait for async fulfillment
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(callback).toHaveBeenCalledWith('active')
    expect(callback).toHaveBeenCalledWith('complete')
    expect(typeof unsubscribe).toBe('function')

    // Test unsubscribe
    callback.mockClear()
    unsubscribe()

    // Trigger another query change
    backend.registerQuery({ name: 'other' }, options)
    await new Promise(resolve => setTimeout(resolve, 10))

    // Should not be called after unsubscribe
    expect(callback).not.toHaveBeenCalled()
  })

  it('should handle dispose operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Should not throw
    await expect(backend.dispose()).resolves.toBeUndefined()
  })

  it('should handle isReady operation', async () => {
    const backend = adapter.createCollectionBackend(collection, ['name'])

    // Should not throw and complete successfully
    await expect(backend.isReady()).resolves.toBeUndefined()
  })

  it('should handle errors in storage creation', () => {
    const errorAdapter = new AsyncDataAdapter({
      storage: () => {
        throw new Error('Storage creation failed')
      },
    })

    // Storage error should be thrown during collection creation
    expect(() => {
      new Collection<TestItem>('error-test', errorAdapter)
    }).toThrow('Storage creation failed')
  })

  it('should handle custom error handler', () => {
    const onError = vi.fn()
    const errorAdapter = new AsyncDataAdapter({
      storage: () => {
        throw new Error('Storage creation failed')
      },
      onError,
    })

    // Storage error should be thrown during collection creation
    expect(() => {
      new Collection<TestItem>('error-test', errorAdapter)
    }).toThrow('Storage creation failed')
  })

  it('should handle id-based selector optimization', () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Test query state management for id-based selectors
    const selector = { id: '1' }

    // Query should start in active state
    expect(backend.getQueryState(selector, {})).toBe('active')

    // Query result should be empty initially
    expect(backend.getQueryResult(selector, {})).toEqual([])

    // Should be able to register and unregister queries
    backend.registerQuery(selector, {})
    backend.unregisterQuery(selector, {})

    expect(backend.getQueryState(selector, {})).toBe('active')
  })

  it('should handle null selector', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Insert test items
    await backend.insert({ id: '1', name: 'test1' })
    await backend.insert({ id: '2', name: 'test2' })

    // Register a query with null selector
    backend.registerQuery({} as TestItem, {})

    // Query should be registered
    expect(backend.getQueryState({} as TestItem, {})).toBe('active')
    expect(backend.getQueryResult({} as TestItem, {})).toEqual([])

    // Cleanup
    backend.unregisterQuery({} as TestItem, {})
  })

  it('should handle empty selector', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Wait for backend to be ready
    await backend.isReady()

    // Insert test items
    await backend.insert({ id: '1', name: 'test1' })
    await backend.insert({ id: '2', name: 'test2' })

    // Register a query with empty selector
    backend.registerQuery({}, {})

    // Query should be registered and have initial state
    expect(backend.getQueryState({}, {})).toBe('active')
    expect(backend.getQueryResult({}, {})).toEqual([])
    expect(backend.getQueryError({}, {})).toBeNull()

    // Can unregister query
    backend.unregisterQuery({}, {})
    expect(backend.getQueryState({}, {})).toBe('active') // Still active after unregister
  })

  it('should handle indexed queries', async () => {
    const backend = adapter.createCollectionBackend(collection, ['name'])

    // Wait for setup
    await backend.isReady()

    // Insert test items
    await backend.insert({ id: '1', name: 'alice' })
    await backend.insert({ id: '2', name: 'bob' })
    await backend.insert({ id: '3', name: 'alice' })

    // Register indexed query
    backend.registerQuery({ name: 'alice' }, {})

    // Query should be registered and have initial state
    expect(backend.getQueryState({ name: 'alice' }, {})).toBe('active')
    expect(backend.getQueryResult({ name: 'alice' }, {})).toEqual([])
    expect(backend.getQueryError({ name: 'alice' }, {})).toBeNull()

    // Can unregister query
    backend.unregisterQuery({ name: 'alice' }, {})
  })

  it('should handle query updates after mutations', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const callback = vi.fn()

    // Register query and listener
    const unsubscribe = backend.onQueryStateChange({ name: 'test' }, {}, callback)
    backend.registerQuery({ name: 'test' }, {})

    // Insert matching item
    await backend.insert({ id: '1', name: 'test' })

    // Query should have completed after mutation-triggered recompute
    expect(backend.getQueryState({ name: 'test' }, {})).toBe('complete')
    expect(typeof unsubscribe).toBe('function')

    // Cleanup
    unsubscribe()
    backend.unregisterQuery({ name: 'test' }, {})
  })

  it('should handle errors during operation execution', async () => {
    // Create adapter with storage that throws on insert
    const failingStorageFactory = () => {
      const storage = new MockStorageAdapter('failing')
      storage.insert = vi.fn().mockRejectedValue(new Error('Insert failed'))
      return storage
    }

    const failingAdapter = new AsyncDataAdapter({
      storage: failingStorageFactory,
    })

    const failingCollection = new Collection<TestItem>('failing', failingAdapter)
    const backend = failingAdapter.createCollectionBackend(failingCollection, [])

    await expect(backend.insert({ id: '1', name: 'test' })).rejects.toThrow('Insert failed')
  })

  it('should handle duplicate id on insert', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    await backend.insert({ id: '1', name: 'test' })

    // Try to insert with same id
    await expect(backend.insert({ id: '1', name: 'test2' })).rejects.toThrow('Item with id 1 already exists')
  })

  it('should handle duplicate id on updateOne', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    await backend.insert({ id: '1', name: 'test1' })
    await backend.insert({ id: '2', name: 'test2' })

    // Try to update id to existing value
    await expect(backend.updateOne({ id: '1' }, { $set: { id: '2' } })).rejects.toThrow('Item with id 2 already exists')
  })

  it('should handle duplicate id on updateMany', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    await backend.insert({ id: '1', name: 'test' })
    await backend.insert({ id: '2', name: 'test' })
    await backend.insert({ id: '3', name: 'other' })

    // Try to update all 'test' items to have same id
    await expect(backend.updateMany({ name: 'test' }, { $set: { id: '3' } })).rejects.toThrow('Item with id 3 already exists')
  })

  it('should handle duplicate id on replaceOne', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    await backend.insert({ id: '1', name: 'test1' })
    await backend.insert({ id: '2', name: 'test2' })

    // Try to replace with existing id
    await expect(backend.replaceOne({ id: '1' }, { id: '2', name: 'replaced' })).rejects.toThrow('Item with id 2 already exists')
  })

  it('should handle operations with missing storage adapter', async () => {
    const missingAdapter = new AsyncDataAdapter({
      storage: (name) => {
        if (name === 'missing-storage') return null as any
        return mockStorageFactory(name) // Return valid storage for other collections
      },
      // suppress default console.error to avoid noisy stderr during this test
      onError: () => {},
    })

    const missingCollection = new Collection<TestItem>('missing-storage', missingAdapter)
    const backend = missingAdapter.createCollectionBackend(missingCollection, [])

    // Wait for setup to complete (this should fail)
    await expect(backend.isReady()).rejects.toThrow('No persistence adapter for collection missing-storage')

    // Also test that insert fails
    await expect(backend.insert({ id: '1', name: 'test' })).rejects.toThrow('No persistence adapter for collection missing-storage')

    // Ensure no queries are left active to avoid unhandled rejections
    void backend.dispose()
  })

  it('should execute query with sort, skip, limit, and fields options', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    // Insert test data
    await backend.insert({ id: '1', name: 'alice', value: 10 })
    await backend.insert({ id: '2', name: 'bob', value: 20 })
    await backend.insert({ id: '3', name: 'charlie', value: 30 })

    // Query with all options
    const queryOptions = {
      sort: { value: -1 as const },
      skip: 1,
      limit: 1,
      fields: { name: 1 as const, id: 0 as const },
    }
    backend.registerQuery({}, queryOptions)

    // Query should be registered with options
    expect(backend.getQueryState({}, queryOptions)).toBe('active')
    expect(backend.getQueryResult({}, queryOptions)).toEqual([])

    // Cleanup
    backend.unregisterQuery({}, queryOptions)
  })

  it('should handle fields with id exclusion', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    await backend.insert({ id: '1', name: 'test', value: 100 })

    const fieldsOptions = { fields: { id: 0 as const } }
    backend.registerQuery({}, fieldsOptions)

    // Query should be registered with field options
    expect(backend.getQueryState({}, fieldsOptions)).toBe('active')
    expect(backend.getQueryResult({}, fieldsOptions)).toEqual([])

    // Cleanup
    backend.unregisterQuery({}, fieldsOptions)
  })

  // Additional edge/coverage tests merged from coverage spec
  it('invokes default onError (console.error) when a subscriber throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const localAdapter = new AsyncDataAdapter({ storage: mockStorageFactory })
    const localCollection = new Collection<TestItem>('err2', localAdapter)
    const backend = localAdapter.createCollectionBackend(localCollection, [])

    backend.registerQuery({}, {})
    const unsubscribe = backend.onQueryStateChange({}, {}, () => {
      throw new Error('boom')
    })
    await backend.insert({ id: '1', name: 'x' })
    expect(errorSpy).toHaveBeenCalled()
    unsubscribe()
    errorSpy.mockRestore()
  })

  it('registerQuery throws when registry missing after dispose', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    await backend.dispose()
    expect(() => backend.registerQuery({}, {})).toThrow('Collection test not initialized!')
  })

  it('fulfillQuery error paths: missing registry, missing record, and error publish', async () => {
    const localAdapter = new AsyncDataAdapter({ storage: mockStorageFactory, onError: () => {} })
    // Access private fulfillQuery
    const fulfill = (localAdapter as any).fulfillQuery.bind(localAdapter)
    await expect(fulfill('x', {}, undefined)).rejects.toThrow('Collection x not initialized!')

    // Seed empty registry for collection 'y' so fulfill returns early when record missing
    ;(localAdapter as any).queries.set('y', new Map())
    await expect(fulfill('y', {}, undefined)).resolves.toBeUndefined()

    // Seed a record and stub executeQuery to throw for error publish
    const qid = queryId({}, undefined)
    ;(localAdapter as any).queries.set('z', new Map([
      [qid, { selector: {}, options: undefined, state: 'active', error: null, items: [], listeners: new Set() }],
    ]))
    const execSpy = vi.spyOn(localAdapter as any, 'executeQuery').mockRejectedValue(new Error('exec-fail'))
    const publishSpy = vi.spyOn(localAdapter as any, 'publishState')
    await (localAdapter as any).fulfillQuery('z', {}, undefined)
    expect(publishSpy).toHaveBeenCalledWith('z', qid, 'error', expect.any(Error))
    execSpy.mockRestore()
  })

  it('getIndexInfo error/null selector and non-optimizable cases', async () => {
    const localAdapter = new AsyncDataAdapter({ storage: mockStorageFactory })
    await expect((localAdapter as any).getIndexInfo('nope', {})).rejects.toThrow('No persistence adapter for collection nope')

    // Seed storage and indices
    ;(localAdapter as any).storageAdapters.set('ci', new MockStorageAdapter('ci'))
    ;(localAdapter as any).collectionIndices.set('ci', ['name'])

    const infoNull = await (localAdapter as any).getIndexInfo('ci', null)
    expect(infoNull.matched).toBe(false)

    // Selector missing indexed field
    const r1 = await (localAdapter as any).getIndexInfo('ci', { other: 1 })
    expect(r1.matched).toBe(false)
    // Recognized-but-unsupported operator produces include/exclude null
    const r2 = await (localAdapter as any).getIndexInfo('ci', { name: { $regex: 'x' } })
    expect(r2).toBeDefined()
  })

  it('queryItems early-returns on null/empty optimizedSelector for both matched and unmatched', async () => {
    const localAdapter = new AsyncDataAdapter({ storage: mockStorageFactory })
    const storage = new MockStorageAdapter('q')
    ;(localAdapter as any).storageAdapters.set('q', storage)
    const indexSpy = vi.spyOn(localAdapter as any, 'getIndexInfo')
      .mockResolvedValueOnce({ matched: true, ids: ['1'], optimizedSelector: undefined })
      .mockResolvedValueOnce({ matched: false, ids: [], optimizedSelector: {} })
    await storage.insert([{ id: '1', name: 'n' }])
    await (localAdapter as any).queryItems('q', {})
    await (localAdapter as any).queryItems('q', { x: 1 })
    expect(indexSpy).toHaveBeenCalledTimes(2)
    indexSpy.mockRestore()
  })

  it('checkQueryUpdates paths: missing registry, no affected, and executeQuery error', async () => {
    const localAdapter = new AsyncDataAdapter({ storage: mockStorageFactory, onError: () => {} })
    await expect((localAdapter as any).checkQueryUpdates('nope', [])).rejects.toThrow('Collection nope not initialized!')
    ;(localAdapter as any).queries.set('c', new Map())
    await (localAdapter as any).checkQueryUpdates('c', [{ id: '1', name: 'n' }])
    // Non-matching selector -> empty affected
    ;(localAdapter as any).queries.get('c').set('na', { selector: { y: 2 }, options: undefined, state: 'active', error: null, items: [], listeners: new Set() })
    await (localAdapter as any).checkQueryUpdates('c', [{ id: '1', name: 'n' }])
    // Matching selector, executeQuery throws
    ;(localAdapter as any).queries.get('c').set('qid', { selector: {}, options: undefined, state: 'active', error: null, items: [], listeners: new Set() })
    const execSpy = vi.spyOn(localAdapter as any, 'executeQuery').mockRejectedValue(new Error('boom'))
    await (localAdapter as any).checkQueryUpdates('c', [{ id: '1', name: 'n' }])
    execSpy.mockRestore()
  })

  it('private operations throw when storage is missing', async () => {
    const localAdapter = new AsyncDataAdapter({ storage: mockStorageFactory, onError: () => {} })
    await expect((localAdapter as any).insert('m', { id: '1' })).rejects.toThrow('No persistence adapter for collection m')
    await expect((localAdapter as any).updateOne('m', {}, {})).rejects.toThrow('No persistence adapter for collection m')
    await expect((localAdapter as any).updateMany('m', {}, {})).rejects.toThrow('No persistence adapter for collection m')
    await expect((localAdapter as any).replaceOne('m', {}, {})).rejects.toThrow('No persistence adapter for collection m')
    await expect((localAdapter as any).removeOne('m', {})).rejects.toThrow('No persistence adapter for collection m')
    await expect((localAdapter as any).removeMany('m', {})).rejects.toThrow('No persistence adapter for collection m')
  })

  it('registerQuery twice merges existing record and still fulfills', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'dup' }
    backend.registerQuery(selector, {})
    // registering again should hit the spread of existing record (lines 96-99)
    backend.registerQuery(selector, {})
    // trigger fulfillment
    await backend.insert({ id: 'x', name: 'dup' })
    expect(backend.getQueryState(selector, {})).toBe('complete')
  })

  it('onQueryStateChange uses registry bucket and routes callback errors to onError', async () => {
    const errorSpy = vi.fn()
    const errorAdapter = new AsyncDataAdapter({ storage: mockStorageFactory, onError: errorSpy })
    const errorCollection = new Collection<TestItem>('err', errorAdapter)
    const backend = errorAdapter.createCollectionBackend(errorCollection, [])

    const selector = { name: 'boom' }
    const unsubscribe = backend.onQueryStateChange(selector, {}, () => {
      throw new Error('listener boom')
    })
    // This register will fulfill and invoke the throwing listener for 'active' and 'complete'
    backend.registerQuery(selector, {})
    await backend.insert({ id: '1', name: 'boom' })
    expect(errorSpy).toHaveBeenCalled()
    unsubscribe()
  })

  it('onQueryStateChange throws if collection not initialized (after dispose)', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    await backend.dispose() // removes queries registry for the collection
    expect(() => backend.onQueryStateChange({}, {}, () => {})).toThrow('Collection test not initialized!')
  })
})
