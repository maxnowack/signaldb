import { vi, beforeEach, describe, it, expect, afterEach } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'
import type Selector from '../src/types/Selector'

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

  postMessage = vi.fn((
    payload: { id: string, workerId: string, method: string, args: unknown[] },
  ) => {
    this.messages.push(payload)
    if (['registerCollection', 'isReady', 'unregisterCollection', 'registerQuery', 'unregisterQuery'].includes(payload.method)) {
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

    it('removes query event listeners when unregistering queries', async () => {
      const backend = adapter.createCollectionBackend(collection, [])
      await backend.isReady()

      const selector: Selector<TestItem> = { id: '1' }
      backend.registerQuery(selector, {})
      backend.unregisterQuery(selector, {})

      expect(mockWorker.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
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
})
