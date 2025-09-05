import { vi, beforeEach, describe, it, expect } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import Collection from '../src/Collection'

interface TestItem {
  id: string,
  name: string,
  value?: number,
}

class MockWorker implements Worker {
  private _onmessage: ((this: Worker, event: MessageEvent) => any) | null = null
  get onmessage() {
    return this._onmessage
  }

  set onmessage(fn: ((this: Worker, event: MessageEvent) => any) | null) {
    this._onmessage = fn
    if (fn) {
      // Record as if addEventListener was used so tests can grab and invoke the handler
      this.addEventListener('message', fn as unknown as EventListener)
    }
  }

  onmessageerror: ((this: Worker, event: MessageEvent) => any) | null = null
  onerror: ((this: AbstractWorker, event: ErrorEvent) => any) | null = null
  terminate = vi.fn()
  dispatchEvent = vi.fn()

  private messageHandlers: ((event: MessageEvent) => void)[] = []

  postMessage = vi.fn((message: { id: string, workerId: string, method: string, args: unknown[] }) => {
    // Auto-respond to isReady to unblock tests that don't simulate a host
    if (message.method === 'isReady') {
      this.messageHandlers.forEach((fn) => fn(new MessageEvent('message', {
        data: { id: message.id, workerId: message.workerId, type: 'response', data: undefined },
      } as MessageEventInit)))
    }
  }) as unknown as Worker['postMessage']

  // Override addEventListener to track message handlers (and keep a mock for expectations)
  addEventListener = vi.fn(((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === 'message') {
      const fn = (typeof listener === 'function'
        ? listener
        : (event: Event) => (listener).handleEvent(event)) as (event: MessageEvent) => void
      this.messageHandlers.push(fn)
    }
  }) as unknown as Worker['addEventListener'])

  // Override removeEventListener to remove handlers
  removeEventListener = vi.fn(((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === 'message') {
      const fn = (typeof listener === 'function'
        ? listener
        : (event: Event) => (listener).handleEvent(event)) as (event: MessageEvent) => void
      const index = this.messageHandlers.indexOf(fn)
      if (index !== -1) {
        this.messageHandlers.splice(index, 1)
      }
    }
  }) as unknown as Worker['removeEventListener'])

  private mockResponse(method: string, args: any[]): any {
    switch (method) {
      case 'insert': {
        return [args[1]]
      }
      case 'updateOne': {
        // selector, update
        const selector = args[1]
        const update = args[2] ?? {}
        const set = update.$set ?? {}
        return [{ ...selector, ...set }]
      }
      case 'replaceOne': {
        // selector, replacement
        const replacement = args[2]
        return [replacement]
      }
      case 'removeOne': {
        const selector = args[1]
        return [selector]
      }
      case 'updateMany': {
        // pretend two items updated if provided via args[3]; else empty array
        const items = Array.isArray(args[3]) ? args[3] : []
        return items
      }
      case 'removeMany': {
        const items = Array.isArray(args[2]) ? args[2] : []
        return items
      }
      case 'registerCollection':
      case 'unregisterCollection':
      case 'registerQuery':
      case 'unregisterQuery': {
        return undefined
      }
      case 'isReady': {
        return true
      }
      default: {
        return null
      }
    }
  }
}

/**
 * Helper to get the id of the last postMessage call on the worker
 * @param worker The mock worker
 * @returns The id string
 * @throws If no postMessage calls recorded or last call missing id
 */
function getLastPostMessageId(worker: MockWorker, method?: string): string {
  const calls = worker.postMessage.mock.calls as any[][]
  const payloads = calls.map(c => c?.[0] as { id?: string, method?: string })
  const filtered = method ? payloads.filter(p => p?.method === method) : payloads
  if (filtered.length === 0) throw new Error('No postMessage calls recorded')
  const last = filtered.at(-1)
  if (!last || typeof last.id !== 'string') throw new Error('Last postMessage payload missing id')
  return last.id
}

describe('WorkerDataAdapter', () => {
  let mockWorker: MockWorker
  let adapter: WorkerDataAdapter
  let collection: Collection<TestItem>

  beforeEach(() => {
    mockWorker = new MockWorker()
    adapter = new WorkerDataAdapter(mockWorker, { id: 'test-adapter' })
    // Use a minimal collection stub to avoid double registrations from Collection constructor
    collection = { name: 'test' } as unknown as Collection<TestItem>
    // Simulate worker ready so exec calls are not gated
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { type: 'ready', workerId: 'test-adapter' },
      } as MessageEventInit))
    })
  })

  it('should create adapter with default id when none provided', () => {
    const defaultAdapter = new WorkerDataAdapter(mockWorker, {})
    // Simulate ready for default id as well to avoid timeouts
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { type: 'ready', workerId: 'default-worker-data-adapter' },
      } as MessageEventInit))
    })
    expect(defaultAdapter).toBeDefined()
  })

it('should create collection backend', async () => {
  const backend = adapter.createCollectionBackend(collection, ['name'])
  expect(backend).toBeDefined()
  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'registerCollection',
    args: ['test', ['name']],
  }))
})

it('should handle insert operation', async () => {
  const backend = adapter.createCollectionBackend(collection, [])
  const testItem: TestItem = { id: '1', name: 'test' }

  const insertPromise = backend.insert(testItem)

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'insert',
    args: ['test', testItem],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'insert')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: testItem },
      }))
    })

    const result = await insertPromise
    expect(result).toEqual(testItem)
  })

it('should handle updateOne operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const updatedItem: TestItem = { id: '1', name: 'updated' }

    const updatePromise = backend.updateOne({ id: '1' }, { $set: { name: 'updated' } })

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'updateOne',
    args: ['test', { id: '1' }, { $set: { name: 'updated' } }],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'updateOne')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: [updatedItem] },
      }))
    })

    const result = await updatePromise
    expect(result).toEqual([updatedItem])
  })

it('should handle updateMany operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const updatedItems: TestItem[] = [{ id: '1', name: 'updated' }, { id: '2', name: 'updated' }]

    const updatePromise = backend.updateMany({ name: 'test' }, { $set: { name: 'updated' } })

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'updateMany',
    args: ['test', { name: 'test' }, { $set: { name: 'updated' } }],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'updateMany')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: updatedItems },
      }))
    })

    const result = await updatePromise
    expect(result).toEqual(updatedItems)
  })

it('should handle replaceOne operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const replacedItem: TestItem = { id: '1', name: 'replaced', value: 100 }

    const replacePromise = backend.replaceOne({ id: '1' }, { name: 'replaced', value: 100 })

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'replaceOne',
    args: ['test', { id: '1' }, { name: 'replaced', value: 100 }],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'replaceOne')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: [replacedItem] },
      }))
    })

    const result = await replacePromise
    expect(result).toEqual([replacedItem])
  })

it('should handle removeOne operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const removedItem: TestItem = { id: '1', name: 'test' }

    const removePromise = backend.removeOne({ id: '1' })

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'removeOne',
    args: ['test', { id: '1' }],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'removeOne')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: [removedItem] },
      }))
    })

    const result = await removePromise
    expect(result).toEqual([removedItem])
  })

it('should handle removeMany operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const removedItems: TestItem[] = [{ id: '1', name: 'test' }, { id: '2', name: 'test' }]

    const removePromise = backend.removeMany({ name: 'test' })

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'removeMany',
    args: ['test', { name: 'test' }],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'removeMany')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: removedItems },
      }))
    })

    const result = await removePromise
    expect(result).toEqual(removedItems)
  })

  it('should register and unregister queries', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'test' }
    const options = { limit: 10 }

    backend.registerQuery(selector, options)
    await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
      id: expect.any(String),
      workerId: 'test-adapter',
      method: 'registerQuery',
      args: ['test', selector, options],
    }))

    backend.unregisterQuery(selector, options)
    await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
      id: expect.any(String),
      workerId: 'test-adapter',
      method: 'unregisterQuery',
      args: ['test', selector, options],
    }))
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
    backend.registerQuery(selector, options)

    await vi.waitFor(() => expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function)))

    // Simulate queryUpdate message (include collectionName inside data)
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          type: 'queryUpdate',
          workerId: 'test-adapter',
          error: null,
          collectionName: 'test',
          data: {
            collectionName: 'test',
            selector,
            options,
            state: 'complete',
            items: [{ id: '1', name: 'test' }],
          },
        },
      }))
    })

    expect(callback).toHaveBeenCalledWith('complete')
    expect(typeof unsubscribe).toBe('function')

    // Test unsubscribe
    unsubscribe()
    expect(mockWorker.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('should handle worker errors', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

  const insertPromise = backend.insert(testItem)

  // Simulate worker error response
  await vi.waitFor(() => expect((mockWorker.postMessage as any).mock.calls.some((c: any[]) => c?.[0]?.method === 'insert')).toBe(true))
  const messageId = getLastPostMessageId(mockWorker, 'insert')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          workerId: 'test-adapter',
          id: messageId,
          type: 'response',
          error: new Error('Worker error'),
        },
      }))
    })

    await expect(insertPromise).rejects.toThrow('Worker error')
  })

  it('should ignore messages for different workers', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

  const insertPromise = backend.insert(testItem)

  // Simulate message for different worker
  await vi.waitFor(() => expect((mockWorker.postMessage as any).mock.calls.some((c: any[]) => c?.[0]?.method === 'insert')).toBe(true))
  const messageId = getLastPostMessageId(mockWorker, 'insert')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          id: messageId,
          workerId: 'different-worker',
          type: 'response',
          data: testItem,
        },
      }))
    })

    // Should not resolve yet
    let resolved = false
    void insertPromise.then(() => {
      resolved = true
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(resolved).toBe(false)
  })

  it('should ignore non-response messages', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

  const insertPromise = backend.insert(testItem)

  // Simulate non-response message
  await vi.waitFor(() => expect((mockWorker.postMessage as any).mock.calls.some((c: any[]) => c?.[0]?.method === 'insert')).toBe(true))
  const messageId = getLastPostMessageId(mockWorker, 'insert')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          id: messageId,
          workerId: 'test-adapter',
          type: 'queryUpdate',
          data: testItem,
        },
      }))
    })

    // Should not resolve yet
    let resolved = false
    void insertPromise.then(() => {
      resolved = true
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(resolved).toBe(false)
  })

  it('should ignore messages with different message id', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const testItem: TestItem = { id: '1', name: 'test' }

    const insertPromise = backend.insert(testItem)

    // Simulate message with different id
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          id: 'different-id',
          workerId: 'test-adapter',
          type: 'response',
          data: testItem,
        },
      }))
    })

    // Should not resolve yet
    let resolved = false
    void insertPromise.then(() => {
      resolved = true
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(resolved).toBe(false)
  })

  it('should handle dispose operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const disposePromise = backend.dispose()

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'unregisterCollection',
    args: ['test'],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'unregisterCollection')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: undefined },
      }))
    })

    await disposePromise
    expect(mockWorker.terminate).toHaveBeenCalled()
  })

  it('should handle isReady operation', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    const readyPromise = backend.isReady()

  await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith({
    id: expect.any(String),
    workerId: 'test-adapter',
    method: 'isReady',
    args: ['test'],
  }))

    // Simulate worker response
    const messageId = getLastPostMessageId(mockWorker, 'isReady')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: undefined },
      }))
    })

    await readyPromise
  })

  it('should reject operations when adapter is disposed', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

  // First dispose
  const disposePromise = backend.dispose()
  await vi.waitFor(() => expect((mockWorker.postMessage as any).mock.calls.some((c: any[]) => c?.[0]?.method === 'unregisterCollection')).toBe(true))
  const messageId = getLastPostMessageId(mockWorker, 'unregisterCollection')
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: { id: messageId, workerId: 'test-adapter', type: 'response', data: undefined },
      }))
    })
    await disposePromise

    // Now try operations
    await expect(backend.insert({ id: '1', name: 'test' })).rejects.toThrow('WorkerDataAdapter is disposed')
  })

  it('should ignore queryUpdate messages for different collections', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const callback = vi.fn()
    const selector = { name: 'test' }

    backend.onQueryStateChange(selector, undefined, callback)

    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          type: 'queryUpdate',
          workerId: 'test-adapter',
          collection: 'different-collection',
          collectionName: 'different-collection',
          selector,
          options: undefined,
          state: 'complete',
          error: null,
          items: [],
        },
      }))
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('should ignore queryUpdate messages for different selectors', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const callback = vi.fn()
    const selector = { name: 'test' }

    backend.onQueryStateChange(selector, undefined, callback)

    // Simulate queryUpdate for different selector
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          type: 'queryUpdate',
          workerId: 'test-adapter',
          collection: 'test',
          collectionName: 'test',
          selector: { name: 'different' },
          options: undefined,
          state: 'complete',
          error: null,
          items: [],
        },
      }))
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('should ignore queryUpdate messages for different options', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const callback = vi.fn()
    const selector = { name: 'test' }
    const options = { limit: 10 }

    backend.onQueryStateChange(selector, options, callback)

    // Simulate queryUpdate for different options
    mockWorker.addEventListener.mock.calls.forEach(([, handler]) => {
      if (typeof handler !== 'function') return
      handler(new MessageEvent('message', {
        data: {
          type: 'queryUpdate',
          workerId: 'test-adapter',
          collection: 'test',
          collectionName: 'test',
          selector,
          options: { limit: 20 },
          state: 'complete',
          error: null,
          items: [],
        },
      }))
    })

    expect(callback).not.toHaveBeenCalled()
  })
})
