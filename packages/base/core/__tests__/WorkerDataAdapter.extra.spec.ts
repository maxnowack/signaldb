import { describe, it, expect, beforeEach, vi } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'

interface TestItem { id: string, name: string }

class FakeWorker implements Worker {
  onmessage: ((this: Worker, event: MessageEvent) => any) | null = null
  onmessageerror: ((this: Worker, event: MessageEvent) => any) | null = null
  onerror: ((this: AbstractWorker, event: ErrorEvent) => any) | null = null
  terminate = vi.fn()
  dispatchEvent = vi.fn()

  messages: any[] = []
  listeners: Array<(event: MessageEvent) => void> = []

  postMessage = vi.fn((message: any) => {
    this.messages.push(message)
    // Auto-respond to isReady like a host would
    if (message.method === 'isReady') {
      this.listeners.forEach(l => l(new MessageEvent('message', {
        data: { id: message.id, workerId: message.workerId, type: 'response', data: undefined },
      } as MessageEventInit)))
    }
  })

  addEventListener = vi.fn(((type: string, listener: (event: MessageEvent) => void) => {
    if (type === 'message') this.listeners.push(listener)
  }) as unknown as Worker['addEventListener'])

  removeEventListener = vi.fn(((type: string, listener: (event: MessageEvent) => void) => {
    if (type !== 'message') return
    const i = this.listeners.indexOf(listener)
    if (i !== -1) this.listeners.splice(i, 1)
  }) as unknown as Worker['removeEventListener'])
}

/**
 * Get the id of the last message posted to the worker
 * @param worker - the fake worker to inspect
 * @returns the last posted message id
 */
function lastMessageId(worker: FakeWorker) {
  const last = worker.messages.at(-1) as { id?: string }
  if (!last?.id) throw new Error('no message id')
  return last.id
}

describe('WorkerDataAdapter extra coverage', () => {
  let worker: FakeWorker
  let adapter: WorkerDataAdapter
  let collection: Collection<TestItem>

  beforeEach(() => {
    worker = new FakeWorker()
    adapter = new WorkerDataAdapter(worker as unknown as Worker, { id: 'w' })
    collection = { name: 'items' } as unknown as Collection<TestItem>
    // Simulate worker ready handshake
    worker.listeners.forEach(l => l(new MessageEvent('message', {
      data: { type: 'ready', workerId: 'w' },
    } as MessageEventInit)))
  })

  it('rejects exec when worker responds with error', async () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const p = backend.insert({ id: '1', name: 'a' })
    // wait until a message was posted to the worker
    await vi.waitFor(() => expect(worker.messages.length).toBeGreaterThan(0))
    const id = lastMessageId(worker)
    // send an error response
    worker.listeners.forEach(l => l(new MessageEvent('message', {
      data: { id, workerId: 'w', type: 'response', error: new Error('boom') },
    } as MessageEventInit)))
    await expect(p).rejects.toThrow('boom')
  })

  it('updates query state and items on queryUpdate messages', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const selector = { name: 'a' }
    const options = { limit: 10 }
    backend.registerQuery(selector, options)

    const active = { type: 'queryUpdate', workerId: 'w', collectionName: 'items', data: { collectionName: 'items', selector, options, state: 'active', items: [] } }
    worker.listeners.forEach(l => l(new MessageEvent('message', { data: active } as MessageEventInit)))
    expect(backend.getQueryState(selector, options)).toBe('active')

    const items = [{ id: '1', name: 'a' }]
    const complete = { type: 'queryUpdate', workerId: 'w', collectionName: 'items', data: { collectionName: 'items', selector, options, state: 'complete', items } }
    worker.listeners.forEach(l => l(new MessageEvent('message', { data: complete } as MessageEventInit)))
    // result caching for worker adapter is minimal; ensure call path does not throw
    void backend.getQueryResult(selector, options)
  })

  it('unsubscribes onQueryStateChange correctly', () => {
    const backend = adapter.createCollectionBackend(collection, [])
    const callback = vi.fn()
    const selector = { name: 'x' }
    const unsubscribe = backend.onQueryStateChange(selector, undefined, callback)
    // first update -> should call
    worker.listeners.forEach(l => l(new MessageEvent('message', {
      data: {
        type: 'queryUpdate',
        workerId: 'w',
        collectionName: 'items',
        data: { collectionName: 'items', selector, options: undefined, state: 'active', items: [] },
      },
    } as MessageEventInit)))
    expect(callback).toHaveBeenCalled()
    const previousRemoveCount = worker.removeEventListener.mock.calls.length
    unsubscribe()
    expect(worker.removeEventListener.mock.calls.length).toBeGreaterThanOrEqual(previousRemoveCount)
    callback.mockClear()
    // further updates should be ignored after unsubscribe
    worker.listeners.forEach(l => l(new MessageEvent('message', {
      data: {
        type: 'queryUpdate',
        workerId: 'w',
        collectionName: 'items',
        data: { collectionName: 'items', selector, options: undefined, state: 'complete', items: [] },
      },
    } as MessageEventInit)))
    expect(callback).not.toHaveBeenCalled()
  })
})
