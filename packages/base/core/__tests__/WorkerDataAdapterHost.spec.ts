import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import type StorageAdapter from '../src/types/StorageAdapter'

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

class MockWorkerContext {
  addEventListener = vi.fn()
  postMessage = vi.fn()
}

// Mock global worker functions
const originalAddEventListener = globalThis.addEventListener
const originalPostMessage = globalThis.postMessage

describe('WorkerDataAdapterHost', () => {
  let mockWorkerContext: MockWorkerContext
  let mockStorageFactory: (name: string) => MockStorageAdapter
  let host: WorkerDataAdapterHost<TestItem> // eslint-disable-line @typescript-eslint/no-unused-vars

  beforeEach(() => {
    // Mock global worker environment
    Object.defineProperty(globalThis, 'addEventListener', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'postMessage', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })

    mockWorkerContext = new MockWorkerContext()

    const storageAdapters = new Map<string, MockStorageAdapter>()
    mockStorageFactory = (name: string) => {
      if (!storageAdapters.has(name)) {
        storageAdapters.set(name, new MockStorageAdapter(name))
      }
      const adapter = storageAdapters.get(name)
      if (!adapter) {
        throw new Error(`Storage adapter not found: ${name}`)
      }
      return adapter
    }

    host = new WorkerDataAdapterHost(mockWorkerContext, {
      storage: mockStorageFactory,
      id: 'test-host',
    })
  })

  afterEach(() => {
    // Restore global functions
    Object.defineProperty(globalThis, 'addEventListener', {
      value: originalAddEventListener,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'postMessage', {
      value: originalPostMessage,
      writable: true,
      configurable: true,
    })
  })

  it('should create host with default id when none provided', () => {
    const defaultHost = new WorkerDataAdapterHost(mockWorkerContext, {
      storage: mockStorageFactory,
    })
    expect(defaultHost).toBeDefined()
  })

  it('should throw error when not in worker context', () => {
    // Remove global worker functions
    delete (globalThis as any).addEventListener
    delete (globalThis as any).postMessage

    expect(() => {
      new WorkerDataAdapterHost(mockWorkerContext, {
        storage: mockStorageFactory,
      })
    }).toThrow('WorkerDataAdapterHost can only be used in a Web Worker context')

    // Restore for other tests
    Object.defineProperty(globalThis, 'addEventListener', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'postMessage', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })
  })

  it('should handle registerCollection message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({
      data: {
        id: 'msg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', ['name', 'value']],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'msg1',
      workerId: 'test-host',
      type: 'response',
      data: undefined,
      error: null,
    })
  })

  it('should handle insert message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // First register collection
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Then insert
    const testItem: TestItem = { id: '1', name: 'test' }
    await messageHandler({
      data: {
        id: 'msg2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', testItem],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'msg2',
      workerId: 'test-host',
      type: 'response',
      data: testItem,
      error: null,
    })
  })

  it('should handle updateOne message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Register collection and insert item
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    const testItem: TestItem = { id: '1', name: 'test' }
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', testItem],
      },
    })

    // Update
    await messageHandler({
      data: {
        id: 'upd1',
        workerId: 'test-host',
        method: 'updateOne',
        args: ['testCollection', { id: '1' }, { $set: { name: 'updated' } }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'upd1',
      workerId: 'test-host',
      type: 'response',
      data: [{ id: '1', name: 'updated' }],
      error: null,
    })
  })

  it('should handle updateMany message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection and data
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test' }],
      },
    })

    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'test' }],
      },
    })

    // Update many
    await messageHandler({
      data: {
        id: 'updMany1',
        workerId: 'test-host',
        method: 'updateMany',
        args: ['testCollection', { name: 'test' }, { $set: { value: 100 } }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'updMany1',
      workerId: 'test-host',
      type: 'response',
      data: [
        { id: '1', name: 'test', value: 100 },
        { id: '2', name: 'test', value: 100 },
      ],
      error: null,
    })
  })

  it('should handle replaceOne message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test', value: 50 }],
      },
    })

    // Replace
    await messageHandler({
      data: {
        id: 'rep1',
        workerId: 'test-host',
        method: 'replaceOne',
        args: ['testCollection', { id: '1' }, { name: 'replaced', value: 100 }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'rep1',
      workerId: 'test-host',
      type: 'response',
      data: [{ id: '1', name: 'replaced', value: 100 }],
      error: null,
    })
  })

  it('should handle removeOne message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    const testItem = { id: '1', name: 'test' }
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', testItem],
      },
    })

    // Remove
    await messageHandler({
      data: {
        id: 'rem1',
        workerId: 'test-host',
        method: 'removeOne',
        args: ['testCollection', { id: '1' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'rem1',
      workerId: 'test-host',
      type: 'response',
      data: [testItem],
      error: null,
    })
  })

  it('should handle removeMany message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test' }],
      },
    })

    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'test' }],
      },
    })

    // Remove many
    await messageHandler({
      data: {
        id: 'remMany1',
        workerId: 'test-host',
        method: 'removeMany',
        args: ['testCollection', { name: 'test' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'remMany1',
      workerId: 'test-host',
      type: 'response',
      data: [
        { id: '1', name: 'test' },
        { id: '2', name: 'test' },
      ],
      error: null,
    })
  })

  it('should handle registerQuery and unregisterQuery messages', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Register collection first
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Register query
    await messageHandler({
      data: {
        id: 'regQ1',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['testCollection', { name: 'test' }, { limit: 10 }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'regQ1',
      workerId: 'test-host',
      type: 'response',
      data: undefined,
      error: null,
    })

    // Unregister query
    await messageHandler({
      data: {
        id: 'unregQ1',
        workerId: 'test-host',
        method: 'unregisterQuery',
        args: ['testCollection', { name: 'test' }, { limit: 10 }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'unregQ1',
      workerId: 'test-host',
      type: 'response',
      data: undefined,
      error: null,
    })
  })

  it('should handle isReady message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Register collection first
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Check if ready
    await messageHandler({
      data: {
        id: 'ready1',
        workerId: 'test-host',
        method: 'isReady',
        args: ['testCollection'],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'ready1',
      workerId: 'test-host',
      type: 'response',
      data: undefined,
      error: null,
    })
  })

  it('should handle unregisterCollection message', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Register collection first
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Unregister collection
    await messageHandler({
      data: {
        id: 'unreg1',
        workerId: 'test-host',
        method: 'unregisterCollection',
        args: ['testCollection'],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'unreg1',
      workerId: 'test-host',
      type: 'response',
      data: undefined,
      error: null,
    })
  })

  it('should ignore messages for different worker ids', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Ignore initial ready message from constructor
    mockWorkerContext.postMessage.mockClear()

    await messageHandler({
      data: {
        id: 'msg1',
        workerId: 'different-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Should not have responded
    expect(mockWorkerContext.postMessage).not.toHaveBeenCalled()
  })

  it('should handle unknown method', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({
      data: {
        id: 'msg1',
        workerId: 'test-host',
        method: 'unknownMethod',
        args: [],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'msg1',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({
        message: 'Method unknownMethod not found',
      }),
    })
  })

  it('should handle method execution errors', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Try to insert without registering collection first
    await messageHandler({
      data: {
        id: 'msg1',
        workerId: 'test-host',
        method: 'insert',
        args: ['nonexistentCollection', { id: '1', name: 'test' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'msg1',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({
        message: 'No persistence adapter for collection nonexistentCollection',
      }),
    })
  })

  it('should handle custom error handler', async () => {
    const onError = vi.fn()
    const hostWithErrorHandler = new WorkerDataAdapterHost(mockWorkerContext, {
      storage: mockStorageFactory,
      onError,
    })

    // The host should use custom error handler (though this test doesn't trigger it directly)
    expect(hostWithErrorHandler).toBeDefined()
  })

  it('should handle query updates after mutations', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection and register query
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    await messageHandler({
      data: {
        id: 'regQ1',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['testCollection', { name: 'test' }],
      },
    })

    mockWorkerContext.postMessage.mockClear()

    // Insert item that matches query
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test' }],
      },
    })

    // Should receive insert response + query updates
    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'ins1',
      workerId: 'test-host',
      type: 'response',
      data: { id: '1', name: 'test' },
      error: null,
    })

    // Should also receive query update messages
    const queryUpdateCalls = mockWorkerContext.postMessage.mock.calls.filter(
      call => call[0].type === 'queryUpdate',
    )
    expect(queryUpdateCalls.length).toBeGreaterThan(0)
  })

  it('should handle id-based selector optimization', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Insert items
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test1' }],
      },
    })

    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'test2' }],
      },
    })

    // Register query with id selector
    await messageHandler({
      data: {
        id: 'regQ1',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['testCollection', { id: '1' }],
      },
    })

    // The query should be optimized for id lookup
    expect(mockWorkerContext.postMessage).toHaveBeenCalled()
  })

  it('should handle null selector optimization', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Register query with null selector
    await messageHandler({
      data: {
        id: 'regQ1',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['testCollection', null],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalled()
  })

  it('should handle indexed queries', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection with index
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', ['name']],
      },
    })

    // Insert items
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'alice' }],
      },
    })

    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'bob' }],
      },
    })

    // Register indexed query
    await messageHandler({
      data: {
        id: 'regQ1',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['testCollection', { name: 'alice' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalled()
  })

  it('should handle operations with no matching items', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Try updateOne with no matching items
    await messageHandler({
      data: {
        id: 'upd1',
        workerId: 'test-host',
        method: 'updateOne',
        args: ['testCollection', { id: 'nonexistent' }, { $set: { name: 'updated' } }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'upd1',
      workerId: 'test-host',
      type: 'response',
      data: [],
      error: null,
    })
  })

  it('should handle $exists false and null selectors in indexed paths', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection with index on name and insert two items
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', ['name']],
      },
    })

    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'alice' }],
      },
    })

    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'bob' }],
      },
    })

    // Update many with $exists false
    await messageHandler({
      data: {
        id: 'updExists',
        workerId: 'test-host',
        method: 'updateMany',
        args: ['testCollection', { name: { $exists: false } } as any, { $set: { value: 1 } }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'updExists',
      workerId: 'test-host',
      type: 'response',
      data: [],
      error: null,
    })

    // Update many with explicit null
    await messageHandler({
      data: {
        id: 'updNull',
        workerId: 'test-host',
        method: 'updateMany',
        args: ['testCollection', { name: null } as any, { $set: { value: 1 } }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'updNull',
      workerId: 'test-host',
      type: 'response',
      data: [],
      error: null,
    })
  })

  it('should handle duplicate id errors', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })

    // Insert first item
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test1' }],
      },
    })

    // Try to insert duplicate
    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'test2' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'ins2',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({
        message: 'Item with id 1 already exists',
      }),
    })
  })

  it('should error on registerQuery if collection not initialized', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({
      data: {
        id: 'regQ-error',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['unknownCollection', { name: 'x' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'regQ-error',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({ message: 'Collection unknownCollection not initialized!' }),
    })
  })

  it('should use index include for matching selector', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({
      data: { id: 'reg', workerId: 'test-host', method: 'registerCollection', args: ['c', ['name']] },
    })
    await messageHandler({
      data: { id: 'i1', workerId: 'test-host', method: 'insert', args: ['c', { id: '1', name: 'alice' }] },
    })
    await messageHandler({
      data: { id: 'i2', workerId: 'test-host', method: 'insert', args: ['c', { id: '2', name: 'bob' }] },
    })

    // removeMany with selector that should hit include branch in index optimization
    await messageHandler({
      data: { id: 'rmAlice', workerId: 'test-host', method: 'removeMany', args: ['c', { name: 'alice' }] },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'rmAlice',
      workerId: 'test-host',
      type: 'response',
      data: [{ id: '1', name: 'alice' }],
      error: null,
    })
  })

  it('should use index exclude for $ne selector', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({
      data: { id: 'reg', workerId: 'test-host', method: 'registerCollection', args: ['c2', ['name']] },
    })
    await messageHandler({
      data: { id: 'i1', workerId: 'test-host', method: 'insert', args: ['c2', { id: '1', name: 'alice' }] },
    })
    await messageHandler({
      data: { id: 'i2', workerId: 'test-host', method: 'insert', args: ['c2', { id: '2', name: 'bob' }] },
    })

    // remove many where name != 'alice' should remove bob
    await messageHandler({
      data: { id: 'rmNotAlice', workerId: 'test-host', method: 'removeMany', args: ['c2', { name: { $ne: 'alice' } } as any] },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'rmNotAlice',
      workerId: 'test-host',
      type: 'response',
      data: [{ id: '2', name: 'bob' }],
      error: null,
    })
  })

  it('should resolve isReady and allow unregisterCollection', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({ data: { id: 'r', workerId: 'test-host', method: 'registerCollection', args: ['rdy', []] } })
    await messageHandler({ data: { id: 'ready', workerId: 'test-host', method: 'isReady', args: ['rdy'] } })
    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({ id: 'ready', workerId: 'test-host', type: 'response', data: undefined, error: null })

    await messageHandler({ data: { id: 'u', workerId: 'test-host', method: 'unregisterCollection', args: ['rdy'] } })
    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({ id: 'u', workerId: 'test-host', type: 'response', data: undefined, error: null })
  })

  it('should project fields (exclude id) on queryUpdate complete', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection
    await messageHandler({ data: { id: 'regp', workerId: 'test-host', method: 'registerCollection', args: ['proj', []] } })
    await messageHandler({ data: { id: 'insp', workerId: 'test-host', method: 'insert', args: ['proj', { id: '1', name: 'n' }] } })

    // Register query with fields option that excludes id
    await messageHandler({
      data: {
        id: 'regQp',
        workerId: 'test-host',
        method: 'registerQuery',
        args: ['proj', { name: 'n' }, { fields: { id: 0, name: 1 } }],
      },
    })

    // Trigger mutation to cause queryUpdate
    await messageHandler({
      data: {
        id: 'updp', workerId: 'test-host', method: 'updateOne', args: ['proj', { id: '1' }, { $set: { name: 'n' } }],
      },
    })

    // Expect at least one queryUpdate complete with item missing id
    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'queryUpdate',
      data: expect.objectContaining({
        state: 'complete',
        items: [expect.not.objectContaining({ id: expect.anything() })],
      }),
    }))
  })

  it('should error on updateOne when new id collides', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    await messageHandler({ data: { id: 'regu', workerId: 'test-host', method: 'registerCollection', args: ['u', []] } })
    await messageHandler({ data: { id: 'i1', workerId: 'test-host', method: 'insert', args: ['u', { id: '1', name: 'a' }] } })
    await messageHandler({ data: { id: 'i2', workerId: 'test-host', method: 'insert', args: ['u', { id: '2', name: 'b' }] } })

    await messageHandler({ data: { id: 'u1', workerId: 'test-host', method: 'updateOne', args: ['u', { id: '1' }, { $set: { id: '2' } }] } })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'u1',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({ message: 'Item with id 2 already exists' }),
    })
  })

  it('should error on updateMany when new id collides', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection and seed data
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'a' }],
      },
    })
    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'a' }],
      },
    })

    // Attempt to update both to id '2'
    await messageHandler({
      data: {
        id: 'updManyCollision',
        workerId: 'test-host',
        method: 'updateMany',
        args: ['testCollection', { name: 'a' }, { $set: { id: '2' } }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'updManyCollision',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({ message: 'Item with id 2 already exists' }),
    })
  })

  it('should error on replaceOne when new id collides', async () => {
    const messageHandler = mockWorkerContext.addEventListener.mock.calls[0][1]

    // Setup collection and seed data
    await messageHandler({
      data: {
        id: 'reg1',
        workerId: 'test-host',
        method: 'registerCollection',
        args: ['testCollection', []],
      },
    })
    await messageHandler({
      data: {
        id: 'ins1',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '1', name: 'a' }],
      },
    })
    await messageHandler({
      data: {
        id: 'ins2',
        workerId: 'test-host',
        method: 'insert',
        args: ['testCollection', { id: '2', name: 'b' }],
      },
    })

    // Attempt to replace id 1 with id 2
    await messageHandler({
      data: {
        id: 'replCollision',
        workerId: 'test-host',
        method: 'replaceOne',
        args: ['testCollection', { id: '1' }, { id: '2', name: 'x' }],
      },
    })

    expect(mockWorkerContext.postMessage).toHaveBeenCalledWith({
      id: 'replCollision',
      workerId: 'test-host',
      type: 'response',
      data: null,
      error: expect.objectContaining({ message: 'Item with id 2 already exists' }),
    })
  })
})
