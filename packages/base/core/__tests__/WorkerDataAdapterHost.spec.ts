import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  name?: string,
  age?: number,
  status?: string,
  value?: number,
}

type WorkerHostMessage = {
  id: string,
  workerId: string,
  type: string,
  data: unknown,
  error: unknown,
}

class MockWorkerContext {
  responses: WorkerHostMessage[] = []
  postMessage = vi.fn((payload: WorkerHostMessage) => {
    this.responses.push(payload)
  })

  private handler: ((event: MessageEvent) => void) | null = null

  addEventListener(type: 'message', listener: (event: MessageEvent) => any) {
    if (type !== 'message') return
    this.handler = listener
  }

  emit(data: unknown) {
    this.handler?.({ data } as MessageEvent)
  }

  clearResponses() {
    this.responses = []
    this.postMessage.mockClear()
  }

  getResponse(id: string) {
    return this.responses.find(r => r.id === id)
  }

  getQueryUpdates(collectionName: string) {
    return this.responses.filter(r =>
      r.type === 'queryUpdate'
      && (r.data as any)?.collectionName === collectionName,
    )
  }
}

describe('WorkerDataAdapterHost', () => {
  beforeAll(() => {
    ;(globalThis as any).addEventListener = () => {}
    ;(globalThis as any).postMessage = () => {}
  })

  afterAll(() => {
    delete (globalThis as any).addEventListener
    delete (globalThis as any).postMessage
  })

  let context: MockWorkerContext
  let host: WorkerDataAdapterHost<TestItem>
  let storageAdapters: Map<string, ReturnType<typeof memoryStorageAdapter<TestItem>>>

  beforeEach(() => {
    context = new MockWorkerContext()
    storageAdapters = new Map()
    host = new WorkerDataAdapterHost(context, {
      id: 'test-host',
      storage: (name) => {
        if (!storageAdapters.has(name)) {
          storageAdapters.set(name, memoryStorageAdapter<TestItem>([]))
        }
        return storageAdapters.get(name) as ReturnType<typeof memoryStorageAdapter<TestItem>>
      },
    })
  })

  /**
   * Sends a worker request and returns the generated message id.
   * @param method - Worker method to invoke.
   * @param args - Arguments forwarded to the host handler.
   * @returns Generated request id.
   */
  async function sendRequest(method: string, args: unknown[]) {
    const id = Math.random().toString(36).slice(2)
    await (host as any).handleMessage('test-host', id, method, args)
    return id
  }

  /**
   * Waits for the worker context to send a response.
   * @param id - Request identifier returned by sendRequest.
   * @returns The matching response payload.
   */
  async function waitForResponse(id: string) {
    await vi.waitFor(() => context.getResponse(id) != null, { timeout: 5000 })
    return context.getResponse(id)
  }

  describe('Initialization and Configuration', () => {
    it('sends ready message on construction', () => {
      expect(context.responses[0]).toEqual({
        id: 'ready',
        workerId: 'test-host',
        type: 'ready',
        data: null,
        error: null,
      })
    })

    it('uses default id when not provided', () => {
      const newContext = new MockWorkerContext()
      const newHost = new WorkerDataAdapterHost(newContext, {
        storage: () => memoryStorageAdapter<TestItem>(),
      })
      expect(newHost).toBeDefined()
      expect(newContext.responses[0].workerId).toBe('default-worker-data-adapter')
    })

    it('calls custom error handler when provided', async () => {
      const errorHandler = vi.fn()
      const newContext = new MockWorkerContext()
      new WorkerDataAdapterHost(newContext, {
        id: 'error-test',
        storage: () => memoryStorageAdapter<TestItem>(),
        onError: errorHandler,
      })

      newContext.emit(undefined)
      await vi.waitFor(() => expect(errorHandler).toHaveBeenCalled())
    })

    it('calls custom log function when provided', async () => {
      const logFunction = vi.fn()
      const newContext = new MockWorkerContext()
      const newHost = new WorkerDataAdapterHost(newContext, {
        id: 'log-test',
        storage: () => memoryStorageAdapter<TestItem>(),
        log: logFunction,
      })

      await (newHost as any).handleMessage('log-test', 'id', 'registerCollection', ['items', []])
      expect(logFunction).toHaveBeenCalled()
    })

    it('logs errors with the default onError handler', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const newContext = new MockWorkerContext()
      new WorkerDataAdapterHost(newContext, {
        id: 'default-error',
        storage: () => memoryStorageAdapter<TestItem>(),
      })

      newContext.emit(undefined)
      await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error)))
      consoleSpy.mockRestore()
    })

    it('throws when worker globals are missing', () => {
      const originalAdd = (globalThis as any).addEventListener
      const originalPost = (globalThis as any).postMessage
      delete (globalThis as any).addEventListener
      delete (globalThis as any).postMessage
      const context_ = new MockWorkerContext()

      try {
        expect(() => new WorkerDataAdapterHost(context_, {
          storage: () => memoryStorageAdapter<TestItem>(),
        })).toThrow('WorkerDataAdapterHost can only be used in a Web Worker context')
      } finally {
        ;(globalThis as any).addEventListener = originalAdd
        ;(globalThis as any).postMessage = originalPost
      }
    })

    it('invokes onError when worker event handler fails', async () => {
      const errorHandler = vi.fn()
      const newContext = new MockWorkerContext()
      new WorkerDataAdapterHost(newContext, {
        id: 'event-error',
        storage: () => memoryStorageAdapter<TestItem>([]),
        onError: errorHandler,
      })

      newContext.emit(null)
      await vi.waitFor(() => expect(errorHandler).toHaveBeenCalledWith(expect.any(Error)))
    })

    it('responds with error when storage adapter is missing', async () => {
      const failingContext = new MockWorkerContext()
      const failingHost = new WorkerDataAdapterHost(failingContext, {
        id: 'missing-storage',
        storage: () => undefined as any,
      })
      const id = Math.random().toString(36).slice(2)

      await (failingHost as any).handleMessage('missing-storage', id, 'registerCollection', ['items', []])
      const response = failingContext.getResponse(id)
      expect(response?.error).toBeInstanceOf(Error)
    })
  })

  describe('Message Routing', () => {
    it('ignores messages from different worker IDs', async () => {
      await sendRequest('registerCollection', ['items', []])
      context.clearResponses()

      await (host as any).handleMessage('different-host', 'test-id', 'insert', ['items', [[{ id: '1', name: 'Test' }]]])

      expect(context.responses.length).toBe(0)
    })

    it('returns error for unknown method', async () => {
      const id = await sendRequest('unknownMethod', [])
      const response = await waitForResponse(id)
      expect(response?.error).toBeInstanceOf(Error)
    })

    it('handles message without throwing', () => {
      expect(() => (host as any).handleMessage('test-host', 'test-msg', 'unknownMethod', [])).not.toThrow()
    })

    it('dispatches operations via worker context events', async () => {
      const eventContext = new MockWorkerContext()
      const eventStorageAdapters = new Map<
        string,
        ReturnType<typeof memoryStorageAdapter<TestItem>>
      >()
      const eventHost = new WorkerDataAdapterHost(eventContext, {
        id: 'event-driven',
        storage: (name) => {
          if (!eventStorageAdapters.has(name)) {
            eventStorageAdapters.set(name, memoryStorageAdapter<TestItem>([]))
          }
          return eventStorageAdapters.get(name) as ReturnType<typeof memoryStorageAdapter<TestItem>>
        },
      })

      const messageId = 'evt-message'
      eventContext.emit({
        id: messageId,
        workerId: 'event-driven',
        method: 'registerCollection',
        args: ['items', []],
      })

      await vi.waitFor(() => {
        expect(eventContext.postMessage).toHaveBeenCalledWith(expect.objectContaining({
          id: messageId,
          type: 'response',
        }))
      })
      expect(eventHost).toBeDefined()
    })
  })

  describe('Collection Management', () => {
    it('registers collection with indices and sets up storage', async () => {
      const id = await sendRequest('registerCollection', ['items', ['name', 'age']])
      const response = await waitForResponse(id)

      expect(response).toBeDefined()
      expect(response?.type).toBe('response')
      expect(storageAdapters.has('items')).toBe(true)
    })

    it('unregisters collection and cleans up', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      const id = await sendRequest('unregisterCollection', ['items'])
      const response = await waitForResponse(id)

      expect(response).toBeDefined()
      expect(response?.type).toBe('response')
    })

    it('waits for storage adapter to be ready before operations', async () => {
      const id = await sendRequest('registerCollection', ['items', []])
      await waitForResponse(id)

      context.clearResponses()
      const readyId = await sendRequest('isReady', ['items'])
      const response = await waitForResponse(readyId)

      expect(response).toBeDefined()
      expect(response?.type).toBe('response')
    })
  })

  describe('Insert Operations', () => {
    it('handles insert with batched items', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      context.clearResponses()
      const id = await sendRequest('insert', [
        'items',
        [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])
    })

    it('returns error when inserting item with existing id', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('insert', ['items', [[{ id: '1', name: 'Duplicate' }]]])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([expect.any(Error)])
    })

    it('returns error when inserting item without id', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      context.clearResponses()
      const id = await sendRequest('insert', ['items', [[{ name: 'No ID' } as any]]])
      const response = await waitForResponse(id)
      expect(response?.data).toEqual([expect.any(Error)])
    })
  })

  describe('Update Operations', () => {
    it('handles updateOne with modifier', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice', age: 30 }]]])

      context.clearResponses()
      const id = await sendRequest('updateOne', [
        'items',
        [[{ id: '1' }, { $set: { age: 31 } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[{ id: '1', name: 'Alice', age: 31 }]])
    })

    it('updateOne returns empty array when no item matches', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      context.clearResponses()
      const id = await sendRequest('updateOne', [
        'items',
        [[{ id: 'nonexistent' }, { $set: { name: 'Updated' } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[]])
    })

    it('updateOne ignores $setOnInsert when item exists', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('updateOne', [
        'items',
        [[{ id: '1' }, { $set: { name: 'Updated' }, $setOnInsert: { age: 25 } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[{ id: '1', name: 'Updated' }]])
    })

    it('updateOne returns error when trying to change id to existing id', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]]])

      context.clearResponses()
      const id = await sendRequest('updateOne', [
        'items',
        [[{ id: '1' }, { $set: { id: '2' } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([expect.any(Error)])
    })

    it('handles updateMany with multiple matches', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', [
        'items',
        [[{ id: '1', status: 'pending' }], [{ id: '2', status: 'pending' }]],
      ])

      context.clearResponses()
      const id = await sendRequest('updateMany', [
        'items',
        [[{ status: 'pending' }, { $set: { status: 'done' } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[
        { id: '1', status: 'done' },
        { id: '2', status: 'done' },
      ]])
    })

    it('updateMany returns empty array when no items match', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      context.clearResponses()
      const id = await sendRequest('updateMany', [
        'items',
        [[{ status: 'nonexistent' }, { $set: { status: 'updated' } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[]])
    })

    it('updateMany returns error when trying to change id to existing id', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]]])

      context.clearResponses()
      const id = await sendRequest('updateMany', [
        'items',
        [[{ id: '1' }, { $set: { id: '2' } }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([expect.any(Error)])
    })
  })

  describe('Replace Operations', () => {
    it('handles replaceOne with replacement object', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice', age: 30 }]]])

      context.clearResponses()
      const id = await sendRequest('replaceOne', [
        'items',
        [[{ id: '1' }, { id: '1', name: 'Alicia' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[{ id: '1', name: 'Alicia' }]])
    })

    it('replaceOne preserves id when not in replacement', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('replaceOne', [
        'items',
        [[{ id: '1' }, { name: 'Alicia' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[{ id: '1', name: 'Alicia' }]])
    })

    it('replaceOne returns empty array when no item matches', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      context.clearResponses()
      const id = await sendRequest('replaceOne', [
        'items',
        [[{ id: 'nonexistent' }, { name: 'New' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[]])
    })

    it('replaceOne returns error when trying to use existing id', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]]])

      context.clearResponses()
      const id = await sendRequest('replaceOne', [
        'items',
        [[{ id: '1' }, { id: '2', name: 'Charlie' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([expect.any(Error)])
    })
  })

  describe('Remove Operations', () => {
    it('handles removeOne', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]]])

      context.clearResponses()
      const id = await sendRequest('removeOne', [
        'items',
        [[{ id: '1' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[{ id: '1', name: 'Alice' }]])
    })

    it('removeOne returns empty array when no item matches', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      context.clearResponses()
      const id = await sendRequest('removeOne', [
        'items',
        [[{ id: 'nonexistent' }]],
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([[]])
    })

    it('handles removeMany with multiple matches', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', status: 'old' }], [{ id: '2', status: 'old' }]]])

      context.clearResponses()
      const id = await sendRequest('removeMany', [
        'items',
        [[{ status: 'old' }]],
      ])
      const response = await waitForResponse(id)

      expect((response?.data as any[])[0]).toHaveLength(2)
    })
  })

  describe('Query Operations', () => {
    it('registers and tracks queries', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('registerQuery', ['items', { name: 'Alice' }, { limit: 1 }])
      await waitForResponse(id)

      const updates = context.getQueryUpdates('items')
      expect(updates.length).toBeGreaterThan(0)
    })

    it('throws error when registering query before collection setup', async () => {
      const id = await sendRequest('registerQuery', ['missing', { name: 'Test' }, {}])
      const response = await waitForResponse(id)
      expect(response?.error).toBeInstanceOf(Error)
    })

    it('unregisters queries', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('registerQuery', ['items', { name: 'Alice' }, {}])

      context.clearResponses()
      const id = await sendRequest('unregisterQuery', ['items', { name: 'Alice' }, {}])
      const response = await waitForResponse(id)

      expect(response).toBeDefined()
    })

    it('throws error when unregistering query from uninitialized collection', async () => {
      const id = await sendRequest('unregisterQuery', ['unknown', { name: 'Test' }, {}])
      const response = await waitForResponse(id)

      expect(response?.error).toBeInstanceOf(Error)
    })

    it('emits query updates when data changes affect registered queries', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('registerQuery', ['items', { name: 'Alice' }, {}])

      context.clearResponses()
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      await vi.waitFor(() => context.getQueryUpdates('items').length > 0)
      const updates = context.getQueryUpdates('items')
      expect(updates.length).toBeGreaterThan(0)
    })

    it('responds with error when executing query on unknown collection', async () => {
      const id = await sendRequest('executeQuery', ['missing', { name: 'Unknown' }, undefined])
      const response = await waitForResponse(id)
      expect(response?.error).toBeInstanceOf(Error)
    })

    it('uses index optimization for id-based queries', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', { id: '1' }, undefined])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('uses index optimization for indexed field queries', async () => {
      await sendRequest('registerCollection', ['items', ['name']])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', { name: 'Alice' }, undefined])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('handles queries that target null indexed values', async () => {
      await sendRequest('registerCollection', ['items', ['status']])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [
        [{ id: '1', status: 'active' }],
        [{ id: '2', name: 'NoStatus' }],
        [{ id: '3', status: null as any }],
      ]])

      const id = await sendRequest('executeQuery', ['items', { status: null }, undefined])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([
        { id: '2', name: 'NoStatus' },
        { id: '3', status: null },
      ])
    })

    it('handles $ne null queries using index exclusion paths', async () => {
      await sendRequest('registerCollection', ['items', ['status']])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [
        [{ id: '1', status: 'active' }],
        [{ id: '2', name: 'NoStatus' }],
        [{ id: '3', status: null as any }],
      ]])

      const id = await sendRequest('executeQuery', [
        'items',
        { status: { $ne: null } as any },
        undefined,
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '1', status: 'active' }])
    })

    it('handles query with sort option', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', [
        'items',
        [[{ id: '2', name: 'Bob' }], [{ id: '1', name: 'Alice' }]],
      ])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', {}, { sort: { name: 1 } }])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
    })

    it('handles query with skip and limit options', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', [
        'items',
        [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }], [{ id: '3', name: 'Charlie' }]],
      ])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', {}, { skip: 1, limit: 1 }])
      const response = await waitForResponse(id)

      expect((response?.data as any[]).length).toBe(1)
    })

    it('handles query with field projection', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice', age: 30 }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', { id: '1' }, { fields: { name: 1 } }])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('handles query with id field excluded', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', { id: '1' }, { fields: { id: 0, name: 1 } }])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ name: 'Alice' }])
    })

    it('filters indexed results when selector still has unmatched fields', async () => {
      await sendRequest('registerCollection', ['items', ['status']])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [
        [{ id: '1', status: 'active', value: 5 }],
        [{ id: '2', status: 'active', value: 20 }],
      ]])

      const id = await sendRequest('executeQuery', [
        'items',
        { status: 'active', value: { $gt: 10 } as any },
        undefined,
      ])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '2', status: 'active', value: 20 }])
    })

    it('handles empty selector as match-all', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1' }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', {}, undefined])
      const response = await waitForResponse(id)

      expect(response?.data).toEqual([{ id: '1' }])
    })

    it('handles null selector as no matches', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1' }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', null as any, undefined])
      const response = await waitForResponse(id)
      expect(response?.data).toEqual([])
    })

    it('executes queries via executeQuery', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))
      await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])

      context.clearResponses()
      const id = await sendRequest('executeQuery', ['items', { name: 'Alice' }, undefined])
      const response = await waitForResponse(id)

      expect(response).toBeDefined()
      expect(response?.type).toBe('response')
      expect(response?.data).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('returns non-matching index info for null selectors', async () => {
      await sendRequest('registerCollection', ['items', []])
      await vi.waitFor(() => storageAdapters.has('items'))

      const info = await (host as any).getIndexInfo('items', null)
      expect(info).toEqual({ matched: false, ids: [], optimizedSelector: {} })
    })
  })
})
