import { vi, beforeEach, describe, it, expect } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'
import type { Selector } from '../src'

interface TestItem {
  id: string,
  name: string,
}

const waitForBatchedMessage = () => new Promise(resolve => setTimeout(resolve, 0))

class MockWorker implements Worker {
  onmessage: ((this: Worker, event: MessageEvent) => any) | null = null
  onmessageerror: ((this: Worker, event: MessageEvent) => any) | null = null
  onerror: ((this: AbstractWorker, event: ErrorEvent) => any) | null = null
  terminate = vi.fn()
  dispatchEvent = vi.fn(() => false)

  private messageHandlers: ((event: MessageEvent) => void)[] = []
  private messages: { id: string, workerId: string, method: string, args: unknown[] }[] = []

  postMessage = vi.fn((payload: { id: string, workerId: string, method: string, args: unknown[] }) => {
    this.messages.push(payload)
    if (['registerCollection', 'isReady', 'unregisterCollection', 'registerQuery', 'unregisterQuery'].includes(payload.method)) {
      queueMicrotask(() => {
        this.emit({ type: 'response', workerId: payload.workerId, id: payload.id, data: undefined, error: null })
      })
    }
  }) as unknown as Worker['postMessage']

  addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type !== 'message') return
    const fn = typeof listener === 'function'
      ? listener
      : (event: Event) => (listener as EventListenerObject).handleEvent(event)
    this.messageHandlers.push(fn as (event: MessageEvent) => void)
  }) as unknown as Worker['addEventListener']

  removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type !== 'message') return
    const fn = typeof listener === 'function'
      ? listener
      : (event: Event) => (listener as EventListenerObject).handleEvent(event)
    const index = this.messageHandlers.indexOf(fn as (event: MessageEvent) => void)
    if (index !== -1) this.messageHandlers.splice(index, 1)
  }) as unknown as Worker['removeEventListener']

  emit(data: any) {
    const event = new MessageEvent('message', { data })
    this.messageHandlers.forEach(handler => handler(event))
  }

  emitReady(workerId: string) {
    this.emit({ type: 'ready', workerId })
  }

  respondToLast(data: any, error: any = null) {
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

  respondTo(method: string, data: any, error: any = null) {
    const message = [...this.messages].reverse().find(m => m.method === method)
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

  it('registers collection and waits for readiness', async () => {
    const backend = adapter.createCollectionBackend(collection, ['name'])
    await vi.waitFor(() => mockWorker.sentMessages.some(message => message.method === 'registerCollection'))
    await backend.isReady()
    expect(mockWorker.sentMessages.some(message => message.method === 'registerCollection')).toBe(true)
    expect(mockWorker.sentMessages.some(message => message.method === 'isReady')).toBe(true)
  })

  it('sends batched insert payloads and resolves with worker response', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    await backend.isReady()
    mockWorker.clearCalls()

    const insertPromise = backend.insert({ id: '1', name: 'Alice' })
    const batchPromise = backend.insert({ id: '2', name: 'Bob' })

    let insertMessage: { args: any[] } | undefined
    await waitForBatchedMessage()
    insertMessage = mockWorker.sentMessages.find(message => message.method === 'insert')

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
