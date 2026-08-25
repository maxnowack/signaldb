import { vi, beforeEach, describe, it, expect } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type { WorkerDataAdapterEndpoint } from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'
import type { CollectionBackend } from '../src/DataAdapter'
import type Selector from '../src/types/Selector'

interface TestItem {
  id: string,
  status?: string,
  rank?: number,
}

class MockWorker implements WorkerDataAdapterEndpoint {
  private handlers: ((event: MessageEvent) => void)[] = []
  public messages: { id: string, workerId: string, method: string }[] = []

  postMessage = vi.fn((message: unknown) => {
    const payload = message as { id: string, workerId: string, method: string }
    this.messages.push(payload)
    if (['registerCollection', 'isReady', 'registerQuery', 'unregisterQuery'].includes(payload.method)) {
      queueMicrotask(() => {
        this.emit({
          type: 'response', workerId: payload.workerId, id: payload.id, data: undefined, error: null,
        })
      })
    }
  })

  addEventListener = vi.fn((type: 'message', listener: (event: MessageEvent) => void) => {
    if (type !== 'message') return
    this.handlers.push(listener)
  })

  removeEventListener = vi.fn((type: 'message', listener: (event: MessageEvent) => void) => {
    if (type !== 'message') return
    const index = this.handlers.indexOf(listener)
    if (index !== -1) this.handlers.splice(index, 1)
  })

  emit(data: Record<string, unknown>) {
    const event = new MessageEvent('message', { data })
    this.handlers.forEach(handler => handler(event))
  }

  // Answers one specific recorded message rather than the most recent one of its kind, which is
  // what lets a test settle several in-flight writes in an order of its choosing.
  respondToMessage(method: string, occurrence: number, results: unknown[]) {
    const message = this.messages.filter(entry => entry.method === method)[occurrence]
    if (!message) throw new Error(`no ${method} #${occurrence} recorded`)
    this.emit({
      type: 'response', workerId: message.workerId, id: message.id, data: results, error: null,
    })
  }
}

describe('a burst of writes that have not settled yet', () => {
  let worker: MockWorker
  let adapter: WorkerDataAdapter
  let backend: CollectionBackend<TestItem, string>

  const selector: Selector<TestItem> = { status: 'open' }

  // Writes are batched to the next tick, so a message only leaves after one.
  const flush = () => new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

  beforeEach(async () => {
    worker = new MockWorker()
    adapter = new WorkerDataAdapter(worker, { id: 'test' })
    worker.emit({ type: 'ready', workerId: 'test' })
    backend = adapter.createCollectionBackend(
      { name: 'test' } as unknown as Collection<TestItem>,
      [],
    )
    await backend.isReady()
    backend.registerQuery(selector, {})
    worker.emit({
      type: 'queryUpdate',
      workerId: 'test',
      data: {
        collectionName: 'test', selector, options: {}, state: 'complete', items: [],
      },
      error: null,
    })
  })

  // Several writes can be in flight for the same item, and they do not have to settle in the order
  // they were issued. Each id therefore keeps every in-flight write touching it, not just the
  // newest: dropping the one that settled has to restore what the write below it said, never fall
  // back to the stored row and never take a later write's effect away with it.
  it('keeps the newest in-flight write for an item when an older one settles first', async () => {
    const inserted: TestItem = { id: 'a', status: 'open', rank: 1 }
    const insert = backend.insert(inserted)
    await flush()

    const update = backend.updateOne({ id: 'a' }, { $set: { rank: 9 } })
    await flush()

    expect(backend.getQueryResult(selector, {})).toEqual([{ id: 'a', status: 'open', rank: 9 }])

    // The insert settles while the update is still in flight.
    worker.respondToMessage('insert', 0, [inserted])
    await insert

    expect(backend.getQueryResult(selector, {})).toEqual([{ id: 'a', status: 'open', rank: 9 }])

    worker.respondToMessage('updateOne', 0, [{ id: 'a', status: 'open', rank: 9 }])
    await update
  })

  it('drops an item again once every write touching it has settled', async () => {
    const inserted: TestItem = { id: 'a', status: 'open', rank: 1 }
    const insert = backend.insert(inserted)
    await flush()
    const remove = backend.removeOne({ id: 'a' })
    await flush()

    expect(backend.getQueryResult(selector, {})).toEqual([])

    worker.respondToMessage('insert', 0, [inserted])
    await insert
    worker.respondToMessage('removeOne', 0, [inserted])
    await remove

    expect(backend.getQueryResult(selector, {})).toEqual([])
  })

  // A burst of writes issued without awaiting them — a bulk import, a rebuild of a derived index —
  // is what the incremental serving path exists for, so the result it serves during one has to be
  // exactly the result it would have rebuilt. `WorkerPendingWrites.bench.ts` measures what that
  // costs; this only pins that stepping forward and rebuilding agree.
  it('serves the same result during a burst as rebuilding it would', async () => {
    const size = 500
    const items = Array.from({ length: size }, (_unused, index) => ({ id: `item-${index}`, status: 'open', rank: index }))
    const writes = items.map(item => backend.insert(item))

    const served = backend.getQueryResult(selector, {})
    expect(served).toHaveLength(size)
    expect(served.map(item => item.id).toSorted())
      .toEqual(Array.from({ length: size }, (_unused, index) => `item-${index}`).toSorted())

    // One batched message carries the whole burst, so its response carries one result per write.
    await flush()
    worker.respondToMessage('insert', 0, items)
    await Promise.all(writes)
  })

  // A query whose result is a projection or a window cannot be brought up to date from itself — a
  // projected item can no longer be matched against a selector naming the fields it dropped, and a
  // limited query's content can depend on rows it does not hold. Both fall back to the rebuild.
  it('serves a limited query correctly while several writes are in flight', async () => {
    const options = { sort: { rank: 1 as const }, limit: 2 }
    backend.registerQuery(selector, options)
    worker.emit({
      type: 'queryUpdate',
      workerId: 'test',
      data: {
        collectionName: 'test', selector, options, state: 'complete', items: [],
      },
      error: null,
    })

    const first = backend.insert({ id: 'a', status: 'open', rank: 3 })
    await flush()
    const second = backend.insert({ id: 'b', status: 'open', rank: 1 })
    await flush()
    const third = backend.insert({ id: 'c', status: 'open', rank: 2 })
    await flush()

    expect(backend.getQueryResult(selector, options).map(item => item.id)).toEqual(['b', 'c'])

    worker.respondToMessage('insert', 0, [{ id: 'a', status: 'open', rank: 3 }])
    worker.respondToMessage('insert', 1, [{ id: 'b', status: 'open', rank: 1 }])
    worker.respondToMessage('insert', 2, [{ id: 'c', status: 'open', rank: 2 }])
    await Promise.all([first, second, third])
  })
})
