import { describe, it, expect, beforeEach, vi } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'

interface TestItem { id: string, name: string }

type WorkerMessage = {
  method: string,
  workerId: string,
  id: string,
} & Record<string, unknown>

class MockWorker implements Worker {
  onmessage: ((this: Worker, event: MessageEvent) => any) | null = null
  onmessageerror: ((this: Worker, event: MessageEvent) => any) | null = null
  onerror: ((this: AbstractWorker, event: ErrorEvent) => any) | null = null
  terminate = vi.fn()
  dispatchEvent = vi.fn(() => false)

  private handlers: ((event: MessageEvent) => void)[] = []
  private listenerMap = new Map<EventListenerOrEventListenerObject, (event: MessageEvent) => void>()
  private messages: WorkerMessage[] = []

  postMessage = vi.fn((payload: WorkerMessage) => {
    this.messages.push(payload)
    if (['registerCollection', 'isReady', 'unregisterCollection', 'registerQuery', 'unregisterQuery'].includes(payload.method)) {
      queueMicrotask(() => this.emit({ type: 'response', workerId: payload.workerId, id: payload.id, data: undefined, error: null }))
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
    this.handlers.push(handler)
  }) as unknown as Worker['addEventListener']

  removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type !== 'message') return
    const handler = this.listenerMap.get(listener)
    if (!handler) return
    const index = this.handlers.indexOf(handler)
    if (index !== -1) this.handlers.splice(index, 1)
    this.listenerMap.delete(listener)
  }) as unknown as Worker['removeEventListener']

  emit(data: Record<string, unknown>) {
    const event = new MessageEvent('message', { data })
    this.handlers.forEach(handler => handler(event))
  }

  ready(id: string) {
    this.emit({ type: 'ready', workerId: id })
  }

  respond(payload: unknown, error?: Error) {
    const last = this.messages.at(-1)
    if (!last) throw new Error('No postMessage recorded')
    this.emit({ type: 'response', workerId: last.workerId, id: last.id, data: payload, error })
  }

  respondTo(method: string, data: unknown, error?: Error) {
    const message = this.messages.toReversed().find(m => m.method === method)
    if (!message) throw new Error(`No postMessage recorded for method ${method}`)
    this.emit({ type: 'response', workerId: message.workerId, id: message.id, data, error })
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

const waitForBatchedMessage = () => new Promise(resolve => setTimeout(resolve, 0))

describe('WorkerDataAdapter (extra scenarios)', () => {
  let worker: MockWorker
  let adapter: WorkerDataAdapter
  let collection: Collection<TestItem>

  beforeEach(() => {
    worker = new MockWorker()
    adapter = new WorkerDataAdapter(worker, { id: 'extra-adapter' })
    collection = { name: 'extra' } as unknown as Collection<TestItem>
    worker.ready('extra-adapter')
  })

  it('caches query results while query is active', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    await backend.isReady()
    worker.clearCalls()
    const selector = { name: 'Alice' }

    backend.registerQuery(selector, {})
    worker.emit({
      type: 'queryUpdate',
      workerId: 'extra-adapter',
      data: {
        collectionName: 'extra',
        selector,
        state: 'complete',
        items: [{ id: '1', name: 'Alice' }],
      },
    })

    expect(backend.getQueryResult(selector, {})).toEqual([{ id: '1', name: 'Alice' }])
  })

  it('propagates worker errors to operation promises', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    await backend.isReady()
    worker.clearCalls()
    const promise = backend.insert({ id: '1', name: 'Boom' })
    await waitForBatchedMessage()
    const insertMessage = worker.sentMessages.find(message => message.method === 'insert')
    expect(insertMessage).toBeDefined()
    worker.respondTo('insert', null, new Error('worker failed'))
    await expect(promise).rejects.toThrow('worker failed')
  })

  it('unregisterQuery silently ignores unknown selectors', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    await backend.isReady()
    worker.clearCalls()
    expect(() => backend.unregisterQuery({ name: 'ghost' }, {})).not.toThrow()
  })
})
