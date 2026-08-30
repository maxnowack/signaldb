import { vi, beforeEach, describe, it, expect } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type { WorkerDataAdapterEndpoint } from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'
import type { CollectionBackend, QueryOptions } from '../src/DataAdapter'
import type Selector from '../src/types/Selector'
import applyQueryOptions from '../src/utils/applyQueryOptions'

interface TestItem {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
}

class MockWorker implements WorkerDataAdapterEndpoint {
  private handlers: ((event: MessageEvent) => void)[] = []
  private messages: { id: string, workerId: string, method: string }[] = []

  postMessage = vi.fn((message: unknown) => {
    const payload = message as { id: string, workerId: string, method: string }
    this.messages.push(payload)
    // The lifecycle calls are answered for us, the way the host answers them straight away.
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

  respondTo(method: string, results: unknown[]) {
    const message = this.messages.toReversed().find(entry => entry.method === method)
    if (!message) throw new Error(`no ${method} recorded`)
    this.emit({
      type: 'response', workerId: message.workerId, id: message.id, data: results, error: null,
    })
  }
}

/**
 * The result a query would have if the store already held the pending write — which is exactly what
 * the adapter is expected to serve while that write is in flight.
 * @param items - Every item the store holds, with the write applied.
 * @param selector - The query's selector.
 * @param options - The query's options.
 * @returns The expected result.
 */
const expectedResult = (
  items: TestItem[],
  selector: Selector<TestItem>,
  options: QueryOptions<TestItem>,
) => applyQueryOptions(items, selector, options)

describe('serving a query while a write is in flight', () => {
  let worker: MockWorker
  let adapter: WorkerDataAdapter
  let backend: CollectionBackend<TestItem, string>

  const stored: TestItem[] = [
    { id: 'a', status: 'open', rank: 1, name: 'Anna' },
    { id: 'b', status: 'open', rank: 2, name: 'Ben' },
    { id: 'c', status: 'open', rank: 3, name: 'Cleo' },
    { id: 'd', status: 'done', rank: 4, name: 'Dan' },
  ]

  const selector: Selector<TestItem> = { status: 'open' }

  beforeEach(async () => {
    worker = new MockWorker()
    adapter = new WorkerDataAdapter(worker, { id: 'test' })
    worker.emit({ type: 'ready', workerId: 'test' })
    backend = adapter.createCollectionBackend(
      { name: 'test' } as unknown as Collection<TestItem>,
      [],
    )
    await backend.isReady()
  })

  // Writes are batched to the next tick, so the message only leaves after one.
  const flush = () => new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

  const seed = (options: QueryOptions<TestItem>) => {
    backend.registerQuery(selector, options)
    worker.emit({
      type: 'queryUpdate',
      workerId: 'test',
      data: {
        collectionName: 'test',
        selector,
        options,
        state: 'complete',
        items: applyQueryOptions(stored, selector, options),
      },
      error: null,
    })
  }

  // A query that returns everything it matches can be brought up to date exactly from its own
  // result plus the write. A window onto a larger set cannot — see the separate group below.
  describe.each([
    ['unsorted', {}],
    ['sorted', { sort: { rank: 1 } }],
    ['sorted descending', { sort: { rank: -1 } }],
  ] as [string, QueryOptions<TestItem>][])('a %s query', (_name, options) => {
    beforeEach(() => seed(options))

    it('serves an insert that matches as if the store held it', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)

      expect(backend.getQueryResult(selector, options))
        .toEqual(expectedResult([...stored, item], selector, options))

      await flush()
      worker.respondTo('insert', [item])
      await promise
    })

    it('serves an insert that does not match without changing the result', async () => {
      const item: TestItem = { id: 'e', status: 'done', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)

      expect(backend.getQueryResult(selector, options))
        .toEqual(expectedResult([...stored, item], selector, options))

      await flush()
      worker.respondTo('insert', [item])
      await promise
    })

    it('serves an update that keeps the item in the query', async () => {
      const promise = backend.updateOne({ id: 'b' }, { $set: { name: 'Benjamin' } })

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        stored.map(item => (item.id === 'b' ? { ...item, name: 'Benjamin' } : item)),
        selector,
        options,
      ))

      await flush()
      worker.respondTo('updateOne', [[]])
      await promise
    })

    it('serves an update that moves the item out of the query', async () => {
      const promise = backend.updateOne({ id: 'b' }, { $set: { status: 'done' } })

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        stored.map(item => (item.id === 'b' ? { ...item, status: 'done' } : item)),
        selector,
        options,
      ))

      await flush()
      worker.respondTo('updateOne', [[]])
      await promise
    })

    it('serves an update that reorders the query', async () => {
      const promise = backend.updateOne({ id: 'a' }, { $set: { rank: 99 } })

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        stored.map(item => (item.id === 'a' ? { ...item, rank: 99 } : item)),
        selector,
        options,
      ))

      await flush()
      worker.respondTo('updateOne', [[]])
      await promise
    })

    it('serves a removal', async () => {
      const promise = backend.removeOne({ id: 'b' })

      expect(backend.getQueryResult(selector, options))
        .toEqual(expectedResult(stored.filter(item => item.id !== 'b'), selector, options))

      await flush()
      worker.respondTo('removeOne', [[]])
      await promise
    })

    it('serves two writes in flight at once', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const first = backend.insert(item)
      const second = backend.updateOne({ id: 'c' }, { $set: { rank: 99 } })

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        [...stored.map(entry => (entry.id === 'c' ? { ...entry, rank: 99 } : entry)), item],
        selector,
        options,
      ))

      await flush()
      worker.respondTo('insert', [item])
      worker.respondTo('updateOne', [[]])
      await Promise.all([first, second])
    })

    it('serves the stored result again once the write settles', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)
      await flush()
      worker.respondTo('insert', [item])
      await promise

      expect(backend.getQueryResult(selector, options))
        .toEqual(expectedResult(stored, selector, options))
    })
  })

  // A write in flight is layered onto the stored result every time the query is read, and a query
  // is read far more often than it is written to — every cursor read goes through here, and the
  // adapter itself asks several times per write. Computing that layering once per state it can be
  // in is both cheaper and gives readers a stable array to compare against.
  describe('reading the same query twice', () => {
    const options: QueryOptions<TestItem> = { sort: { rank: 1 } }

    beforeEach(() => seed(options))

    it('answers with the same array when nothing has changed', () => {
      expect(backend.getQueryResult(selector, options))
        .toBe(backend.getQueryResult(selector, options))
    })

    it('answers with the same array while a write is in flight', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)

      const first = backend.getQueryResult(selector, options)
      expect(backend.getQueryResult(selector, options)).toBe(first)
      expect(first[0]).toEqual(item)

      await flush()
      worker.respondTo('insert', [item])
      await promise
    })

    it('answers with a new array once another write joins the first', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const first = backend.insert(item)
      const before = backend.getQueryResult(selector, options)

      const second = backend.insert({ id: 'f', status: 'open', rank: 5, name: 'Fay' })
      const after = backend.getQueryResult(selector, options)

      expect(after).not.toBe(before)
      expect(after.some(entry => entry.id === 'f')).toBe(true)

      await flush()
      worker.respondTo('insert', [item, { id: 'f' }])
      await Promise.all([first, second])
    })

    it('answers with the stored array again once the writes settle', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)
      backend.getQueryResult(selector, options)
      await flush()
      worker.respondTo('insert', [item])
      await promise

      expect(backend.getQueryResult(selector, options))
        .toEqual(applyQueryOptions(stored, selector, options))
      expect(backend.getQueryResult(selector, options))
        .toBe(backend.getQueryResult(selector, options))
    })

    it('answers with a new array when the worker sends an update', async () => {
      const before = backend.getQueryResult(selector, options)
      worker.emit({
        type: 'queryUpdate',
        workerId: 'test',
        data: {
          collectionName: 'test',
          selector,
          options,
          state: 'complete',
          delta: {
            added: [], changed: [], removed: ['a'], moved: [], resultCount: 2,
          },
        },
        error: null,
      })

      const after = backend.getQueryResult(selector, options)
      expect(after).not.toBe(before)
      expect(after.some(entry => entry.id === 'a')).toBe(false)
    })
  })

  // A projected result is not the items, it is a view of them, and a write cannot be resolved
  // against a view: applying a modifier to an item that has had fields removed produces something
  // the selector may no longer match. The adapter therefore resolves writes only against items it
  // holds in full, and a projected query is served optimistically exactly when some other query
  // supplies that.
  describe('a projected query', () => {
    const options: QueryOptions<TestItem> = { fields: { name: 1 } }

    beforeEach(() => seed(options))

    describe('when another query holds the items in full', () => {
      beforeEach(() => {
        backend.registerQuery(selector, {})
        worker.emit({
          type: 'queryUpdate',
          workerId: 'test',
          data: {
            collectionName: 'test',
            selector,
            options: {},
            state: 'complete',
            items: applyQueryOptions(stored, selector, {}),
          },
          error: null,
        })
      })

      it('serves an update as if the store held it', async () => {
        const promise = backend.updateOne({ id: 'b' }, { $set: { name: 'Benjamin' } })

        expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
          stored.map(item => (item.id === 'b' ? { ...item, name: 'Benjamin' } : item)),
          selector,
          options,
        ))

        await flush()
        worker.respondTo('updateOne', [[]])
        await promise
      })

      it('serves an update that moves the item out of the query', async () => {
        const promise = backend.updateOne({ id: 'b' }, { $set: { status: 'done' } })

        expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
          stored.map(item => (item.id === 'b' ? { ...item, status: 'done' } : item)),
          selector,
          options,
        ))

        await flush()
        worker.respondTo('updateOne', [[]])
        await promise
      })

      it('serves an insert projected the way the query asks for', async () => {
        const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
        const promise = backend.insert(item)

        expect(backend.getQueryResult(selector, options))
          .toEqual(expectedResult([...stored, item], selector, options))

        await flush()
        worker.respondTo('insert', [item])
        await promise
      })
    })

    describe('when nothing holds the items in full', () => {
      it('keeps serving the last confirmed result rather than dropping rows from it', async () => {
        const promise = backend.updateOne({ id: 'b' }, { $set: { name: 'Benjamin' } })

        expect(backend.getQueryResult(selector, options))
          .toEqual(expectedResult(stored, selector, options))

        await flush()
        worker.respondTo('updateOne', [[]])
        await promise
      })

      it('still serves an insert, which carries the whole item with it', async () => {
        const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
        const promise = backend.insert(item)

        expect(backend.getQueryResult(selector, options))
          .toEqual(expectedResult([...stored, item], selector, options))

        await flush()
        worker.respondTo('insert', [item])
        await promise
      })
    })
  })

  // A window onto a larger set cannot be exact: the adapter holds the window, not what lies beyond
  // it, so an item leaving the window has to be replaced by one it has never seen. What it can do
  // is stay coherent until the store answers, rather than serving something plainly wrong.
  describe('a limited query', () => {
    const options: QueryOptions<TestItem> = { sort: { rank: 1 }, limit: 2 }

    beforeEach(() => seed(options))

    it('shows an insert that sorts into the window, and stays within its length', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)

      const result = backend.getQueryResult(selector, options)
      expect(result[0]).toEqual(item)
      expect(result).toHaveLength(2)

      await flush()
      worker.respondTo('insert', [item])
      await promise
    })
  })

  describe('a skipped query', () => {
    const options: QueryOptions<TestItem> = { sort: { rank: 1 }, skip: 1 }

    beforeEach(() => seed(options))

    it('shows an insert that matches, without knowing what it displaces', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)

      expect(backend.getQueryResult(selector, options).some(entry => entry.id === 'e')).toBe(true)

      await flush()
      worker.respondTo('insert', [item])
      await promise
    })
  })

  describe.each([
    ['limited', { sort: { rank: 1 }, limit: 2 }],
    ['skipped', { sort: { rank: 1 }, skip: 1 }],
  ] as [string, QueryOptions<TestItem>][])('a %s query', (_name, options) => {
    beforeEach(() => seed(options))

    it('does not show an insert that does not match', async () => {
      const item: TestItem = { id: 'e', status: 'done', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)

      expect(backend.getQueryResult(selector, options).some(entry => entry.id === 'e')).toBe(false)

      await flush()
      worker.respondTo('insert', [item])
      await promise
    })

    it('shows an update to an item the window still holds', async () => {
      const promise = backend.updateOne({ id: 'c' }, { $set: { name: 'Cleopatra' } })

      const names = backend.getQueryResult(selector, options).map(entry => entry.name)
      expect(names).not.toContain('Cleo')

      await flush()
      worker.respondTo('updateOne', [[]])
      await promise
    })

    it('drops an item the write takes out of the query', async () => {
      const promise = backend.updateOne({ id: 'b' }, { $set: { status: 'done' } })

      expect(backend.getQueryResult(selector, options).some(entry => entry.id === 'b')).toBe(false)

      await flush()
      worker.respondTo('updateOne', [[]])
      await promise
    })

    it('drops a removed item', async () => {
      const promise = backend.removeOne({ id: 'b' })

      expect(backend.getQueryResult(selector, options).some(entry => entry.id === 'b')).toBe(false)

      await flush()
      worker.respondTo('removeOne', [[]])
      await promise
    })

    it('serves the stored result again once the write settles', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const promise = backend.insert(item)
      await flush()
      worker.respondTo('insert', [item])
      await promise

      expect(backend.getQueryResult(selector, options))
        .toEqual(applyQueryOptions(stored, selector, options))
    })
  })

  describe('a replacement', () => {
    const options: QueryOptions<TestItem> = { sort: { rank: 1 } }

    beforeEach(() => seed(options))

    it('serves the replacement in place of the item it replaces', async () => {
      const promise = backend
        .replaceOne({ id: 'b' }, { status: 'open', rank: 2, name: 'Benjamin' })

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        stored.map(item => (item.id === 'b'
          ? { id: 'b', status: 'open', rank: 2, name: 'Benjamin' }
          : item)),
        selector,
        options,
      ))

      await flush()
      worker.respondTo('replaceOne', [[]])
      await promise
    })

    it('drops the replaced item when the replacement carries a different id', async () => {
      const replacement: TestItem = { id: 'b2', status: 'open', rank: 2, name: 'Benjamin' }
      const promise = backend.replaceOne({ id: 'b' }, replacement)

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        [...stored.filter(item => item.id !== 'b'), replacement],
        selector,
        options,
      ))

      await flush()
      worker.respondTo('replaceOne', [[]])
      await promise
    })
  })

  // A write whose selector names no ids is resolved against everything the active queries show,
  // and what they show already includes the writes that have not come back yet. Resolving it
  // against the stored result instead would let a burst of writes undo each other: the second
  // write would neither see what the first one added nor know what it removed.
  describe('a write resolved by scanning while other writes are in flight', () => {
    const options: QueryOptions<TestItem> = { sort: { rank: 1 } }

    beforeEach(() => seed(options))

    it('sees the pending insert and leaves the pending removal removed', async () => {
      const item: TestItem = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
      const insert = backend.insert(item)
      const removal = backend.removeOne({ id: 'a' })
      const update = backend.updateMany({ status: 'open' }, { $set: { name: 'Renamed' } })

      expect(backend.getQueryResult(selector, options)).toEqual(expectedResult(
        [
          { ...item, name: 'Renamed' },
          { ...stored[1], name: 'Renamed' },
          { ...stored[2], name: 'Renamed' },
        ],
        selector,
        options,
      ))

      await flush()
      worker.respondTo('insert', [item])
      worker.respondTo('removeOne', [[]])
      worker.respondTo('updateMany', [[]])
      await Promise.all([insert, removal, update])
    })
  })
})
