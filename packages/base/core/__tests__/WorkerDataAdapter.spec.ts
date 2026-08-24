import { vi, beforeEach, describe, it, expect, afterEach } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'
import type Selector from '../src/types/Selector'
import queryId from '../src/utils/queryId'

interface TestItem {
  id: string,
  name?: string,
  value?: string,
}

const waitForBatchedMessage = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 0)
})

class MockWorker implements Worker {
  onmessage: ((this: Worker, event: MessageEvent) => any) | null = null
  onmessageerror: ((this: Worker, event: MessageEvent) => any) | null = null
  onerror: ((this: AbstractWorker, event: ErrorEvent) => any) | null = null
  terminate = vi.fn()
  dispatchEvent = vi.fn(() => false)

  private messageHandlers: ((event: MessageEvent) => void)[] = []
  private listenerMap = new Map<EventListenerOrEventListenerObject, (event: MessageEvent) => void>()
  private messages: { id: string, workerId: string, method: string, args: unknown[] }[] = []

  // Lifecycle calls are answered for us, the way a healthy host answers them right away. Tests
  // about a host that cannot answer turn this off.
  autoRespondTo = ['registerCollection', 'isReady', 'unregisterCollection', 'registerQuery', 'unregisterQuery']

  postMessage = vi.fn((
    payload: { id: string, workerId: string, method: string, args: unknown[] },
  ) => {
    this.messages.push(payload)
    if (this.autoRespondTo.includes(payload.method)) {
      queueMicrotask(() => {
        this.emit({ type: 'response', workerId: payload.workerId, id: payload.id, data: undefined, error: null })
      })
    }
  }) as unknown as Worker['postMessage']

  addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type !== 'message') return
    const handler: (event: MessageEvent) => void = typeof listener === 'function'
      ? (event) => {
        listener(event)
      }
      : (event) => {
        listener.handleEvent(event)
      }
    this.listenerMap.set(listener, handler)
    this.messageHandlers.push(handler)
  }) as unknown as Worker['addEventListener']

  removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type !== 'message') return
    const handler = this.listenerMap.get(listener)
    if (!handler) return
    const index = this.messageHandlers.indexOf(handler)
    if (index !== -1) this.messageHandlers.splice(index, 1)
    this.listenerMap.delete(listener)
  }) as unknown as Worker['removeEventListener']

  emit(data: Record<string, unknown>) {
    const event = new MessageEvent('message', { data })
    this.messageHandlers.forEach(handler => handler(event))
  }

  emitReady(workerId: string) {
    this.emit({ type: 'ready', workerId })
  }

  respondToLast(data: unknown, error: unknown = null) {
    const lastCall = this.messages.at(-1)
    if (!lastCall) throw new Error('No postMessage calls recorded')
    this.emit({
      type: 'response',
      workerId: lastCall.workerId,
      id: lastCall.id,
      data,
      error,
    })
  }

  respondTo(method: string, data: unknown, error: unknown = null) {
    const message = this.messages.toReversed().find(m => m.method === method)
    if (!message) throw new Error(`No postMessage recorded for method ${method}`)
    this.emit({
      type: 'response',
      workerId: message.workerId,
      id: message.id,
      data,
      error,
    })
  }

  get lastCall() {
    return this.messages.at(-1)
  }

  clearCalls() {
    this.messages = []
  }

  get sentMessages() {
    return this.messages
  }
}

describe('WorkerDataAdapter', () => {
  let mockWorker: MockWorker
  let adapter: WorkerDataAdapter
  let collection: Collection<TestItem>

  beforeEach(() => {
    mockWorker = new MockWorker()
    adapter = new WorkerDataAdapter(mockWorker, { id: 'test-adapter' })
    collection = { name: 'test' } as unknown as Collection<TestItem>
    mockWorker.emitReady('test-adapter')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initialization and Setup', () => {
    it('creates adapter with id', () => {
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, { id: 'custom-id' })
      expect(testAdapter).toBeDefined()
    })

    it('creates adapter without id', () => {
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, {})
      expect(testAdapter).toBeDefined()
    })

    it('uses default id when not provided', () => {
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, {})
      worker.emitReady('default-worker-data-adapter')

      const testCollection = { name: 'test-collection' } as unknown as Collection<TestItem>
      const backend = testAdapter.createCollectionBackend(testCollection, [])
      expect(backend).toBeDefined()
    })

    it('creates collection backend with all expected methods', () => {
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, { id: 'test' })

      const testCollection = { name: 'test' } as unknown as Collection<TestItem>
      const backend = testAdapter.createCollectionBackend(testCollection, [])

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

    it('registers collection and waits for readiness', async () => {
      const backend = adapter.createCollectionBackend(collection, ['name'])
      await vi.waitFor(() => mockWorker.sentMessages.some(message => message.method === 'registerCollection'))
      await backend.isReady()
      expect(mockWorker.sentMessages.some(message => message.method === 'registerCollection')).toBe(true)
      expect(mockWorker.sentMessages.some(message => message.method === 'isReady')).toBe(true)
    })

    it('timeouts if worker does not send ready message within 5 seconds', async () => {
      vi.useFakeTimers()
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, { id: 'timeout-test' })
      const originalExec = (testAdapter as any).exec
      const execSpy = vi.spyOn(testAdapter as any, 'exec').mockImplementation((...args: any[]) => {
        const promise = originalExec.apply(testAdapter, args)
        promise.catch(() => {})
        return promise
      })
      const testCollection = { name: 'test-collection' } as unknown as Collection<TestItem>
      const backend = testAdapter.createCollectionBackend(testCollection, [])

      const promise = backend.isReady().catch(error => error)
      vi.advanceTimersByTime(5000)

      const result = await promise
      expect(result).toBeInstanceOf(Error)
      expect(result.message).toContain('WorkerDataAdapter initialization timed out')
      execSpy.mockRestore()
    })

    it('ignores ready messages from different worker IDs', async () => {
      vi.useFakeTimers()
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, { id: 'correct-id' })
      const originalExec = (testAdapter as any).exec
      const execSpy = vi.spyOn(testAdapter as any, 'exec').mockImplementation((...args: any[]) => {
        const promise = originalExec.apply(testAdapter, args)
        promise.catch(() => {})
        return promise
      })

      worker.emitReady('wrong-id')

      const testCollection = { name: 'test-collection' } as unknown as Collection<TestItem>
      const backend = testAdapter.createCollectionBackend(testCollection, [])
      const promise = backend.isReady().catch(error => error)

      vi.advanceTimersByTime(5000)
      const result = await promise
      expect(result).toBeInstanceOf(Error)
      expect(result.message).toContain('WorkerDataAdapter initialization timed out')
      execSpy.mockRestore()
    })

    it('calls log function when provided', async () => {
      const logFunction = vi.fn()
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, { id: 'log-test', log: logFunction })
      worker.emitReady('log-test')

      const testCollection = { name: 'test-collection' } as unknown as Collection<TestItem>
      const backend = testAdapter.createCollectionBackend(testCollection, [])
      await backend.isReady()
      worker.clearCalls()

      const promise = backend.insert({ id: '1', value: 'test' })
      await waitForBatchedMessage()
      worker.respondTo('insert', [{ id: '1', value: 'test' }])
      await promise

      expect(logFunction).toHaveBeenCalled()
    })

    it('throws error when operation is called before collection is registered', () => {
      const worker = new MockWorker()
      const testAdapter = new WorkerDataAdapter(worker, { id: 'not-registered-test' })
      worker.emitReady('not-registered-test')

      expect(() => {
        (testAdapter as any).enqueueBatched('unknown-collection', 'insert', [{ id: '1' }])
      }).toThrow('Collection "unknown-collection" is not registered')
    })
  })

  describe('CRUD Operations', () => {
    it('sends batched insert payloads and resolves with worker response', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const insertPromise = backend.insert({ id: '1', name: 'Alice' })
      const batchPromise = backend.insert({ id: '2', name: 'Bob' })

      await waitForBatchedMessage()
      const insertMessage = mockWorker.sentMessages.find(message => message.method === 'insert')

      expect(insertMessage).toBeDefined()
      if (!insertMessage) throw new Error('insert message not recorded')
      expect(insertMessage.args[0]).toBe('test')
      expect(Array.isArray(insertMessage.args[1])).toBe(true)
      expect(insertMessage.args[1]).toEqual([[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]])

      mockWorker.respondTo('insert', [
        [{ id: '1', name: 'Alice' }],
        [{ id: '2', name: 'Bob' }],
      ])

      await expect(insertPromise).resolves.toEqual([{ id: '1', name: 'Alice' }])
      await expect(batchPromise).resolves.toEqual([{ id: '2', name: 'Bob' }])
    })

    it('performs updateOne and forwards worker response', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()
      const promise = backend.updateOne({ id: '1' }, { $set: { name: 'Updated' } })

      await waitForBatchedMessage()
      const updateMessage = mockWorker.sentMessages.find(message => message.method === 'updateOne')
      expect(updateMessage).toBeDefined()
      if (!updateMessage) throw new Error('update message not recorded')
      expect(updateMessage.args[1]).toEqual([[{ id: '1' }, { $set: { name: 'Updated' } }]])

      mockWorker.respondTo('updateOne', [[{ id: '1', name: 'Updated' }]])
      await expect(promise).resolves.toEqual([{ id: '1', name: 'Updated' }])
    })

    it('handles updateMany operation', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.updateMany({ value: 'old' }, { $set: { value: 'new' } })
      await waitForBatchedMessage()
      mockWorker.respondTo('updateMany', [[{ id: '1', value: 'new' }]])

      await expect(promise).resolves.toEqual([{ id: '1', value: 'new' }])
    })

    it('handles replaceOne operation', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.replaceOne({ id: '1' }, { id: '1', value: 'replaced' })
      await waitForBatchedMessage()
      mockWorker.respondTo('replaceOne', [[{ id: '1', value: 'replaced' }]])

      await expect(promise).resolves.toEqual([{ id: '1', value: 'replaced' }])
    })

    it('handles removeOne operation', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.removeOne({ id: '1' })
      await waitForBatchedMessage()
      mockWorker.respondTo('removeOne', [[{ id: '1', value: 'removed' }]])

      await expect(promise).resolves.toEqual([{ id: '1', value: 'removed' }])
    })

    it('handles removeMany operation', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.removeMany({ value: 'test' })
      await waitForBatchedMessage()
      mockWorker.respondTo('removeMany', [[{ id: '1', value: 'test' }]])

      await expect(promise).resolves.toEqual([{ id: '1', value: 'test' }])
    })

    it('does not accumulate message listeners across register/unregister cycles', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const addEventListener = mockWorker.addEventListener as unknown as ReturnType<typeof vi.fn>
      const listenersBefore = addEventListener.mock.calls.length
      for (let index = 0; index < 20; index += 1) {
        const selector: Selector<TestItem> = { id: `${index}` }
        backend.registerQuery(selector, {})
        backend.unregisterQuery(selector, {})
      }

      expect(addEventListener.mock.calls.length).toBe(listenersBefore)
    })
  })

  describe('Query Management', () => {
    it('tracks query state and updates via queryUpdate events', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()
      const selector = { name: 'Alice' }
      const options = { limit: 1 }
      const listener = vi.fn()

      backend.registerQuery(selector, options)
      const unsubscribe = backend.onQueryStateChange(selector, options, listener)

      await vi.waitFor(() => mockWorker.sentMessages.some(message => message.method === 'registerQuery'))

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector,
          options,
          state: 'complete',
          items: [{ id: '1', name: 'Alice' }],
        },
      })

      expect(listener).toHaveBeenCalledWith('complete')
      expect(backend.getQueryResult(selector, options)).toEqual([{ id: '1', name: 'Alice' }])

      unsubscribe()
      backend.unregisterQuery(selector, options)
      await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'unregisterQuery' })))
    })

    it('handles query state operations', () => {
      const backend = adapter.createCollectionBackend(collection, [])
      const selector = { name: 'test' }
      const options = { limit: 10 }

      backend.registerQuery(selector, options)
      expect(backend.getQueryState(selector, options)).toBe('active')
      expect(backend.getQueryError(selector, options)).toBeNull()
      expect(backend.getQueryResult(selector, options)).toEqual([])
      backend.unregisterQuery(selector, options)
    })

    it('caches query results while query is active', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()
      const selector = { name: 'Alice' }

      backend.registerQuery(selector, {})
      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector,
          state: 'complete',
          items: [{ id: '1', name: 'Alice' }],
        },
      })

      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('calls executeQuery and waits for response', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const selector = { value: 'test' }
      const promise = backend.executeQuery(selector, { limit: 5 })

      await waitForBatchedMessage()
      expect(mockWorker.sentMessages.some(m => m.method === 'executeQuery')).toBe(true)

      mockWorker.respondTo('executeQuery', [{ id: '1', value: 'test' }])
      await expect(promise).resolves.toEqual([{ id: '1', value: 'test' }])
    })

    it('returns default state for unknown queries', () => {
      const backend = adapter.createCollectionBackend(collection, [])

      const selector: Selector<TestItem> = { id: 'unknown' }
      expect(backend.getQueryState(selector, {})).toBe('active')
      expect(backend.getQueryError(selector, {})).toBeNull()
      expect(backend.getQueryResult(selector, {})).toEqual([])
    })

    it('handles query state change listener and unsubscribe', () => {
      const backend = adapter.createCollectionBackend(collection, [])
      const callback = () => {}
      const unsubscribe = backend.onQueryStateChange({ name: 'test' }, {}, callback)

      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })

    it('allows query callback cleanup after its query was unregistered', () => {
      const backend = adapter.createCollectionBackend(collection, [])
      const selector = { name: 'test' }

      backend.registerQuery(selector, {})
      const unsubscribe = backend.onQueryStateChange(selector, {}, () => {})
      backend.unregisterQuery(selector, {})

      expect(unsubscribe).not.toThrow()
    })

    it('handles multiple state change callbacks for the same query', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const unsubscribe1 = backend.onQueryStateChange(selector, {}, callback1)
      const unsubscribe2 = backend.onQueryStateChange(selector, {}, callback2)

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector,
          state: 'complete',
          items: [{ id: '1', value: 'test' }],
        },
      })

      expect(callback1).toHaveBeenCalledWith('complete')
      expect(callback2).toHaveBeenCalledWith('complete')

      unsubscribe1()
      unsubscribe2()
    })

    it('handles unsubscribing state change callback', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      const callback = vi.fn()
      const unsubscribe = backend.onQueryStateChange(selector, {}, callback)

      unsubscribe()

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector,
          state: 'complete',
          items: [{ id: '1', value: 'test' }],
        },
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('unregisterQuery silently ignores unknown selectors', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()
      expect(() => backend.unregisterQuery({ name: 'ghost' }, {})).not.toThrow()
    })
  })

  describe('Message Handling', () => {
    it('ignores response messages from different worker IDs', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '1', value: 'test' })
      await waitForBatchedMessage()

      const message = mockWorker.sentMessages[0]
      mockWorker.emit({ type: 'response', workerId: 'wrong-id', id: message.id, data: [{ id: '1', value: 'test' }] })

      mockWorker.respondTo('insert', [{ id: '1', value: 'test' }])
      await expect(promise).resolves.toBeDefined()
    })

    it('ignores non-response message types during exec', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '1', value: 'test' })
      await waitForBatchedMessage()

      const message = mockWorker.sentMessages[0]
      mockWorker.emit({ type: 'queryUpdate', workerId: 'test-adapter', id: message.id, data: {} })

      mockWorker.respondTo('insert', [{ id: '1', value: 'test' }])
      await expect(promise).resolves.toBeDefined()
    })

    it('ignores response messages with mismatched message IDs', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '1', value: 'test' })
      await waitForBatchedMessage()

      mockWorker.emit({ type: 'response', workerId: 'test-adapter', id: 'wrong-id', data: [{ id: '1', value: 'test' }] })

      mockWorker.respondTo('insert', [{ id: '1', value: 'test' }])
      await expect(promise).resolves.toBeDefined()
    })

    it('ignores queryUpdate messages with null data', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: null,
      })

      expect(backend.getQueryState(selector, {})).toBe('active')
    })

    it('ignores queryUpdate messages from wrong worker ID', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'wrong-worker-id',
        data: {
          collectionName: 'test',
          selector,
          state: 'complete',
          items: [{ id: '1', value: 'test' }],
        },
      })

      expect(backend.getQueryResult(selector, {})).toEqual([])
    })

    it('ignores queryUpdate messages from wrong collection', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'wrong-collection',
          selector,
          state: 'complete',
          items: [{ id: '1', value: 'test' }],
        },
      })

      expect(backend.getQueryResult(selector, {})).toEqual([])
    })

    it('ignores queryUpdate messages with mismatched query selector', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector: { value: 'different' },
          state: 'complete',
          items: [{ id: '1', value: 'different' }],
        },
      })

      expect(backend.getQueryResult(selector, {})).toEqual([])
    })

    it('handles queryUpdate with error state', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { value: 'test' }
      backend.registerQuery(selector, {})

      const error = new Error('Query failed')
      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector,
          state: 'error',
          items: [],
        },
        error,
      })

      expect(backend.getQueryState(selector, {})).toBe('error')
    })

    it('propagates worker errors to operation promises', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()
      const promise = backend.insert({ id: '1', name: 'Boom' })
      await waitForBatchedMessage()
      const insertMessage = mockWorker.sentMessages.find(message => message.method === 'insert')
      expect(insertMessage).toBeDefined()
      mockWorker.respondTo('insert', null, new Error('worker failed'))
      await expect(promise).rejects.toThrow('worker failed')
    })
  })

  describe('Lifecycle Management', () => {
    it('disposes collection and terminates worker', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.clearCalls()
      await backend.dispose()
      expect(mockWorker.sentMessages.some(message => message.method === 'unregisterCollection')).toBe(true)
      expect(mockWorker.terminate).toHaveBeenCalled()
    })

    it('rejects operations once disposed', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await backend.dispose()
      await expect(backend.insert({ id: '1', name: 'Alice' })).rejects.toThrow('WorkerDataAdapter is disposed')
    })
  })

  describe('Pending writes on active queries', () => {
    const selector: Selector<TestItem> = {}

    // Registers `selector` and seeds it with `items` as the worker's
    // authoritative result, so a test starts from a settled query.
    const registerSeededQuery = async (
      backend: ReturnType<WorkerDataAdapter['createCollectionBackend']>,
      items: TestItem[],
      querySelector: Selector<TestItem> = selector,
      options: Record<string, unknown> = {},
    ) => {
      backend.registerQuery(querySelector, options)
      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector: querySelector,
          options,
          state: 'complete',
          items,
        },
        error: null,
      })
    }

    it('reflects an insert before the worker confirms it', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }])
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '2', name: 'Bob' })

      // No worker round trip has happened yet — not even the batched
      // postMessage has been sent.
      expect(mockWorker.sentMessages).toHaveLength(0)
      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])

      await waitForBatchedMessage()
      mockWorker.respondTo('insert', [{ id: '2', name: 'Bob' }])
      await promise
    })

    it('notifies active queries immediately with what the write adds', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [])
      const callback = vi.fn()
      backend.onQueryStateChange(selector, {}, callback)
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '1', name: 'Alice' })
      expect(callback).toHaveBeenCalledWith('complete', expect.objectContaining({
        added: [{ index: 0, item: { id: '1', name: 'Alice' } }],
        changed: [],
        removed: [],
        moved: [],
        resultCount: 1,
      }))

      await waitForBatchedMessage()
      mockWorker.respondTo('insert', [{ id: '1', name: 'Alice' }])
      await promise
    })

    it('rolls back an insert the worker rejects', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }])
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '2', name: 'Bob' })
      expect(backend.getQueryResult(selector, {})).toHaveLength(2)

      await waitForBatchedMessage()
      mockWorker.respondTo('insert', null, new Error('duplicate id'))
      await expect(promise).rejects.toThrow('duplicate id')

      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('reflects an update before the worker confirms it', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }])
      mockWorker.clearCalls()

      const promise = backend.updateOne({ id: '1' }, { $set: { name: 'Alicia' } })
      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alicia' }])

      await waitForBatchedMessage()
      mockWorker.respondTo('updateOne', [[{ id: '1', name: 'Alicia' }]])
      await promise
    })

    it('reflects a removal before the worker confirms it', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])
      mockWorker.clearCalls()

      const promise = backend.removeOne({ id: '1' })
      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '2', name: 'Bob' }])

      await waitForBatchedMessage()
      mockWorker.respondTo('removeOne', [[{ id: '1', name: 'Alice' }]])
      await promise
    })

    it('drops an item that a pending update moves out of a query', async () => {
      const nameSelector: Selector<TestItem> = { name: 'Alice' }
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }], nameSelector)
      mockWorker.clearCalls()

      const promise = backend.updateOne({ id: '1' }, { $set: { name: 'Bob' } })
      expect(backend.getQueryResult(nameSelector, {})).toEqual([])

      await waitForBatchedMessage()
      mockWorker.respondTo('updateOne', [[{ id: '1', name: 'Bob' }]])
      await promise
    })

    it('re-applies sort and limit to a pending insert', async () => {
      const options = { sort: { name: 1 as const }, limit: 2 }
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(
        backend,
        [{ id: '1', name: 'Alice' }, { id: '3', name: 'Carol' }],
        selector,
        options,
      )
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '2', name: 'Bob' })
      expect(backend.getQueryResult(selector, options)).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])

      await waitForBatchedMessage()
      mockWorker.respondTo('insert', [{ id: '2', name: 'Bob' }])
      await promise
    })

    it('keeps a later pending write on top of an earlier one', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }])
      mockWorker.clearCalls()

      const first = backend.updateOne({ id: '1' }, { $set: { name: 'Alicia' } })
      const second = backend.updateOne({ id: '1' }, { $set: { name: 'Allie' } })
      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Allie' }])

      await waitForBatchedMessage()
      mockWorker.respondTo('updateOne', [[{ id: '1', name: 'Alicia' }], [{ id: '1', name: 'Allie' }]])
      await Promise.all([first, second])
    })

    // The overlay must cost the size of what is in flight, not the size of what is on screen. An
    // application with a few large queries open writes constantly, and the previous shape rebuilt
    // every query's result — filter and sort included — on every read for as long as any write was
    // unconfirmed.
    it('leaves a query the pending write does not touch on its own array', async () => {
      const otherSelector: Selector<TestItem> = { name: 'Bob' }
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      const untouched = [{ id: '2', name: 'Bob' }]
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }])
      await registerSeededQuery(backend, untouched, otherSelector)
      mockWorker.clearCalls()

      const promise = backend.updateOne({ id: '1' }, { $set: { name: 'Alicia' } })
      // The write is in flight and the other query is served its own array, unrebuilt.
      expect(backend.getQueryResult(otherSelector, {})).toBe(untouched)
      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alicia' }])

      await waitForBatchedMessage()
      mockWorker.respondTo('updateOne', [[{ id: '1', name: 'Alicia' }]])
      await promise
    })

    // A pending insert has no id in any query yet, so "does this touch me" cannot be answered by
    // ids alone — a query whose selector the new item matches has to see it.
    it('shows a pending insert to a query it matches, even though no query held it', async () => {
      const nameSelector: Selector<TestItem> = { name: 'Carol' }
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [], nameSelector)
      mockWorker.clearCalls()

      const promise = backend.insert({ id: '9', name: 'Carol' })
      expect(backend.getQueryResult(nameSelector, {})).toEqual([{ id: '9', name: 'Carol' }])

      await waitForBatchedMessage()
      mockWorker.respondTo('insert', [{ id: '9', name: 'Carol' }])
      await promise
    })

    // `{ id: { $in } }` takes the same shortcut as a plain `{ id }`, and must resolve every one.
    it('resolves an $in update through the id path', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Carol' },
      ])
      mockWorker.clearCalls()

      const promise = backend.updateMany({ id: { $in: ['1', '3'] } }, { $set: { value: 'x' } })
      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '1', name: 'Alice', value: 'x' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Carol', value: 'x' },
      ])

      await waitForBatchedMessage()
      mockWorker.respondTo('updateMany', [[
        { id: '1', name: 'Alice', value: 'x' },
        { id: '3', name: 'Carol', value: 'x' },
      ]])
      await promise
    })

    // A selector that names `id` *and* something else cannot be answered by ids alone: the second
    // condition may exclude a row the id path would have written.
    it('falls back to matching when the selector asks for more than ids', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      await registerSeededQuery(backend, [{ id: '1', name: 'Alice' }])
      mockWorker.clearCalls()

      const promise = backend.updateOne({ id: '1', name: 'Bob' }, { $set: { value: 'x' } })
      // `name` does not match, so nothing is written optimistically.
      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alice' }])

      await waitForBatchedMessage()
      mockWorker.respondTo('updateOne', [[]])
      await promise
    })

    it('leaves query results untouched while no write is pending', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      const items = [{ id: '1', name: 'Alice' }]
      await registerSeededQuery(backend, items)

      // Same array instance the worker delivered — no needless copying or
      // re-sorting on the read path when there is nothing to overlay.
      expect(backend.getQueryResult(selector, {})).toBe(items)
    })
  })
  describe('When the worker cannot answer a lifecycle call', () => {
    const failNext = (method: string, error: Error) => {
      const message = mockWorker.sentMessages.toReversed().find(entry => entry.method === method)
      if (!message) throw new Error(`no ${method} recorded`)
      mockWorker.emit({
        type: 'response', workerId: message.workerId, id: message.id, data: null, error,
      })
    }

    it('reports a query it could not register as failed, rather than leaving it pending', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.autoRespondTo = ['isReady']
      const selector = { name: 'Alice' }
      const listener = vi.fn()
      backend.onQueryStateChange(selector, {}, listener)
      backend.registerQuery(selector, {})

      await vi.waitFor(() => {
        expect(mockWorker.sentMessages.some(m => m.method === 'registerQuery')).toBe(true)
      })
      failNext('registerQuery', new Error('worker is gone'))

      // The failure reaches the query one microtask later, when the call it belongs to settles.
      await vi.waitFor(() => {
        expect(backend.getQueryState(selector, {})).toBe('error')
      })
      expect(backend.getQueryError(selector, {})?.message).toBe('worker is gone')
      expect(listener).toHaveBeenCalledWith('error')
    })

    it('does not leave a failed unregister unhandled', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      mockWorker.autoRespondTo = ['isReady']
      const selector = { name: 'Alice' }
      backend.registerQuery(selector, {})
      await vi.waitFor(() => {
        expect(mockWorker.sentMessages.some(m => m.method === 'registerQuery')).toBe(true)
      })
      backend.unregisterQuery(selector, {})

      await vi.waitFor(() => {
        expect(mockWorker.sentMessages.some(m => m.method === 'unregisterQuery')).toBe(true)
      })
      expect(() => failNext('unregisterQuery', new Error('collection is gone'))).not.toThrow()

      // Nothing is left holding the query, so there is nothing to report it to either.
      expect(backend.getQueryState(selector, {})).toBe('active')
    })

    it('does not leave a failed collection registration unhandled', async () => {
      mockWorker.autoRespondTo = ['isReady']
      const backend = adapter.createCollectionBackend(collection, [])
      await vi.waitFor(() => {
        expect(mockWorker.sentMessages.some(m => m.method === 'registerCollection')).toBe(true)
      })

      expect(() => failNext('registerCollection', new Error('nope'))).not.toThrow()
      expect(backend).toBeDefined()
    })
  })

  describe('Query deltas', () => {
    const register = async (selector: Selector<TestItem>) => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()
      backend.registerQuery(selector, {})
      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          qid: queryId(selector, {}),
          state: 'complete',
          items: [
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' },
          ],
        },
      })
      return backend
    }

    const emitDelta = (selector: Selector<TestItem>, delta: Record<string, unknown>) => {
      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          qid: queryId(selector, {}),
          state: 'complete',
          delta,
        },
      })
    }

    it('applies an addition at the position the delta names', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      emitDelta(selector, {
        added: [{ index: 0, item: { id: '3', name: 'Cleo' } }],
        changed: [],
        removed: [],
        moved: [],
        resultCount: 3,
      })

      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '3', name: 'Cleo' },
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
    })

    it('applies a change without touching the rest of the result', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)
      const before = backend.getQueryResult(selector, {})

      emitDelta(selector, {
        added: [],
        changed: [{ id: '2', name: 'Bobby' }],
        removed: [],
        moved: [],
        resultCount: 2,
      })

      const after = backend.getQueryResult(selector, {})
      expect(after).toEqual([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bobby' }])
      expect(after[0]).toBe(before[0])
    })

    it('applies a removal by id', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      emitDelta(selector, {
        added: [],
        changed: [],
        removed: ['1'],
        moved: [],
        resultCount: 1,
      })

      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '2', name: 'Bob' }])
    })

    it('applies a move', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      emitDelta(selector, {
        added: [],
        changed: [],
        removed: [],
        moved: [{ index: 0, id: '2' }],
        resultCount: 2,
      })

      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '2', name: 'Bob' },
        { id: '1', name: 'Alice' },
      ])
    })

    it('passes the delta on to its listeners', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)
      const listener = vi.fn()
      backend.onQueryStateChange(selector, {}, listener)

      const delta = {
        added: [],
        changed: [{ id: '2', name: 'Bobby' }],
        removed: [],
        moved: [],
        resultCount: 2,
      }
      emitDelta(selector, delta)

      expect(listener).toHaveBeenCalledExactlyOnceWith('complete', delta)
    })

    it('does not notify listeners about a delta that changes nothing', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)
      const listener = vi.fn()
      backend.onQueryStateChange(selector, {}, listener)

      emitDelta(selector, {
        added: [], changed: [], removed: [], moved: [], resultCount: 2,
      })

      expect(listener).not.toHaveBeenCalled()
    })

    it('ignores a delta that does not fit the result it holds', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      emitDelta(selector, {
        added: [],
        changed: [],
        removed: ['does-not-exist'],
        moved: [],
        resultCount: 1,
      })

      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
    })

    it('ignores a delta whose result count does not add up', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      emitDelta(selector, {
        added: [],
        changed: [],
        removed: ['1'],
        moved: [],
        resultCount: 7,
      })

      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
    })

    it('keeps the result it holds when the query goes back to active', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          qid: queryId(selector, {}),
          state: 'active',
        },
      })

      expect(backend.getQueryState(selector, {})).toBe('active')
      expect(backend.getQueryResult(selector, {})).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
    })

    it('applies a delta that arrives after the query went back to active', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: { collectionName: 'test', qid: queryId(selector, {}), state: 'active' },
      })
      emitDelta(selector, {
        added: [], changed: [], removed: ['1'], moved: [], resultCount: 1,
      })

      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '2', name: 'Bob' }])
    })

    it('lets a full result replace whatever it holds', async () => {
      const selector = { name: 'x' }
      const backend = await register(selector)

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          qid: queryId(selector, {}),
          state: 'complete',
          items: [{ id: '9', name: 'Zoe' }],
        },
      })

      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '9', name: 'Zoe' }])
    })
  })

  describe('Message dispatch', () => {
    it('does not add a message listener per registered query', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const addEventListener = mockWorker.addEventListener as unknown as ReturnType<typeof vi.fn>
      const listenersBefore = addEventListener.mock.calls.length
      const selectors = Array.from({ length: 25 }, (_, index) => ({ name: `user-${index}` }))
      selectors.forEach(selector => backend.registerQuery(selector, {}))
      const listenersAfter = addEventListener.mock.calls.length

      expect(listenersAfter - listenersBefore).toBeLessThan(selectors.length)
    })

    it('routes a query update to the matching query only, without rescanning the others', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selectors = Array.from({ length: 10 }, (_, index) => ({ name: `user-${index}` }))
      const listeners = selectors.map(() => vi.fn())
      selectors.forEach((selector, index) => {
        backend.registerQuery(selector, {})
        backend.onQueryStateChange(selector, {}, listeners[index])
      })

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector: selectors[4],
          options: {},
          state: 'complete',
          items: [{ id: '4', name: 'user-4' }],
        },
      })

      expect(listeners[4]).toHaveBeenCalledWith('complete')
      listeners.forEach((listener, index) => {
        if (index === 4) return
        expect(listener).not.toHaveBeenCalled()
      })
      expect(backend.getQueryResult(selectors[4], {})).toEqual([{ id: '4', name: 'user-4' }])
      expect(backend.getQueryResult(selectors[3], {})).toEqual([])
    })

    it('routes updates by the query id the host sends when one is present', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { name: 'Alice' }
      backend.registerQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          qid: queryId(selector, {}),
          state: 'complete',
          items: [{ id: '1', name: 'Alice' }],
        },
      })

      expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alice' }])
    })

    it('keeps queries of different collections apart', async () => {
      const otherCollection = { name: 'other' } as unknown as Collection<TestItem>
      const backend = adapter.createCollectionBackend(collection, [])
      const otherBackend = adapter.createCollectionBackend(otherCollection, [])
      await backend.isReady()
      await otherBackend.isReady()

      const selector = { name: 'Alice' }
      backend.registerQuery(selector, {})
      otherBackend.registerQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'other',
          selector,
          options: {},
          state: 'complete',
          items: [{ id: '1', name: 'Alice' }],
        },
      })

      expect(otherBackend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alice' }])
      expect(backend.getQueryResult(selector, {})).toEqual([])
    })

    it('stops routing updates to a query after it is unregistered', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector = { name: 'Alice' }
      const listener = vi.fn()
      backend.registerQuery(selector, {})
      backend.onQueryStateChange(selector, {}, listener)
      backend.unregisterQuery(selector, {})

      mockWorker.emit({
        type: 'queryUpdate',
        workerId: 'test-adapter',
        data: {
          collectionName: 'test',
          selector,
          options: {},
          state: 'complete',
          items: [{ id: '1', name: 'Alice' }],
        },
      })

      expect(listener).not.toHaveBeenCalled()
    })
  })
})

describe('WorkerDataAdapter readiness', () => {
  let mockWorker: MockWorker
  let adapter: WorkerDataAdapter
  let collection: Collection<TestItem>

  beforeEach(() => {
    mockWorker = new MockWorker()
    adapter = new WorkerDataAdapter(mockWorker, { id: 'test-adapter' })
    collection = { name: 'test' } as unknown as Collection<TestItem>
    mockWorker.emitReady('test-adapter')
  })

  // Readiness happens once and never goes back, so asking twice can only get
  // the same answer — but every question used to cost a worker round trip.
  // Callers ask a lot: a repository helper awaiting `ready()` before touching
  // each record turns a thousand-record sync into a thousand extra messages.
  // One app measured 2,273 `isReady` messages in a single session, more than
  // any other message type it produced.
  it('asks the worker whether a collection is ready exactly once', async () => {
    const backend = adapter.createCollectionBackend(collection, [])

    await backend.isReady()
    await backend.isReady()
    await backend.isReady()
    await waitForBatchedMessage()

    // The one that registration itself started, and no more — the count must
    // not grow with how often callers ask.
    expect(mockWorker.sentMessages.filter(message => message.method === 'isReady')).toHaveLength(1)
  })

  it('still waits for the worker before reporting a collection ready', async () => {
    const worker = new MockWorker()
    worker.autoRespondTo = ['registerCollection']
    const pendingAdapter = new WorkerDataAdapter(worker, { id: 'pending-adapter' })
    worker.emitReady('pending-adapter')
    const backend = pendingAdapter.createCollectionBackend(collection, [])

    let ready = false
    void backend.isReady().then(() => {
      ready = true
    })
    await waitForBatchedMessage()
    expect(ready).toBe(false)

    worker.respondTo('isReady', undefined)
    await waitForBatchedMessage()
    expect(ready).toBe(true)
  })
})
