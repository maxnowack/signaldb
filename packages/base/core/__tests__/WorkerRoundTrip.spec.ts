import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Collection from '../src/Collection'
import { createReactivityAdapter } from '../src'
import type Cursor from '../src/Collection/Cursor'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import type { WorkerDataAdapterEndpoint } from '../src/WorkerDataAdapter'
import type { WorkerDataAdapterHostEndpoint } from '../src/WorkerDataAdapterHost'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
}

/**
 * A pair of endpoints that pass messages to each other the way a worker and its owner do:
 * structurally cloned, so neither side ever hands the other a live object reference, and
 * asynchronously, so ordering is preserved but nothing is observed synchronously.
 *
 * The point of running the real host against the real adapter is that nothing between them is
 * mocked — a delta that does not survive the trip, or that the adapter cannot line up with what it
 * holds, shows up here as a wrong query result rather than as a passing unit test on either side.
 * @returns The two endpoints and a counter of the bytes that crossed between them.
 */
function createMessagePair() {
  const hostListeners: ((event: MessageEvent) => void)[] = []
  const clientListeners: ((event: MessageEvent) => void)[] = []
  const traffic = { toClient: 0, toHost: 0, messagesToClient: 0 }

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value, (key, entry) =>
    (entry instanceof Error ? { message: entry.message } : entry))) as T

  const deliver = (listeners: ((event: MessageEvent) => void)[], data: unknown) => {
    const payload = clone(data)
    queueMicrotask(() => {
      [...listeners].forEach(listener => listener({ data: payload } as MessageEvent))
    })
  }

  const hostEndpoint: WorkerDataAdapterHostEndpoint = {
    addEventListener: (type, listener) => {
      if (type === 'message') hostListeners.push(listener as (event: MessageEvent) => void)
    },
    postMessage: (message: unknown) => {
      traffic.toClient += JSON.stringify(message ?? null).length
      traffic.messagesToClient += 1
      deliver(clientListeners, message)
    },
  }

  const clientEndpoint: WorkerDataAdapterEndpoint = {
    addEventListener: (type, listener) => {
      if (type === 'message') clientListeners.push(listener)
    },
    removeEventListener: (type, listener) => {
      if (type !== 'message') return
      const index = clientListeners.indexOf(listener)
      if (index !== -1) clientListeners.splice(index, 1)
    },
    postMessage: (message: unknown) => {
      traffic.toHost += JSON.stringify(message ?? null).length
      deliver(hostListeners, message)
    },
    terminate: () => {},
  }

  return { hostEndpoint, clientEndpoint, traffic }
}

describe('worker round trip', () => {
  let collection: Collection<TestItem>
  let adapter: WorkerDataAdapter
  let traffic: { toClient: number, toHost: number, messagesToClient: number }
  let storage: ReturnType<typeof memoryStorageAdapter<TestItem>>
  const openObservations: (() => void)[] = []

  const seed = (count: number): TestItem[] => Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    status: 'open',
    rank: index,
    name: `name-${index}`,
  }))

  const setup = async (items: TestItem[], indices: string[] = []) => {
    const pair = createMessagePair()
    traffic = pair.traffic
    storage = memoryStorageAdapter<TestItem>(items.map(item => ({ ...item })))

    new WorkerDataAdapterHost(pair.hostEndpoint, { id: 'round-trip', storage: () => storage })
    adapter = new WorkerDataAdapter(pair.clientEndpoint, { id: 'round-trip' })
    collection = new Collection<TestItem>('items', adapter, { indices })
    await Promise.resolve(collection.isReady())
  }

  afterEach(async () => {
    openObservations.splice(0).forEach(stop => stop())
    await collection?.dispose().catch(() => {})
  })

  /**
   * Starts observing a query and keeps it registered until the test ends.
   *
   * Deliberately not stopped between assertions: the last observer going away unregisters the
   * query, and registering it again is answered with a full result — which would quietly hide the
   * very thing the traffic assertions below are about.
   * @param cursor - The cursor to observe.
   * @returns A function that waits for the result to satisfy a predicate and returns it.
   */
  const observe = (cursor: Cursor<TestItem, TestItem, false>) => {
    const stop = cursor.observeChanges({
      added: () => {},
      changed: () => {},
      removed: () => {},
      movedBefore: () => {},
    })
    openObservations.push(stop)

    return async (predicate: (items: TestItem[]) => boolean) => {
      let current: TestItem[] = []
      await vi.waitFor(() => {
        current = cursor.fetch()
        expect(predicate(current)).toBe(true)
      }, { timeout: 2000, interval: 5 })
      return current
    }
  }

  describe('correctness', () => {
    beforeEach(async () => {
      await setup(seed(5))
    })

    it('delivers the initial result', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      const items = await until(result => result.length === 5)
      expect(items.map(item => item.id)).toEqual([
        'item-0', 'item-1', 'item-2', 'item-3', 'item-4',
      ])
      cursor.cleanup()
    })

    it('reflects an insert at the right position', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.insert({ id: 'new', status: 'open', rank: -1, name: 'first' })
      const items = await until(result => result.length === 6)
      expect(items[0].id).toBe('new')
      cursor.cleanup()
    })

    it('reflects an update', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.updateOne({ id: 'item-2' }, { $set: { name: 'renamed' } })
      const items = await until(result =>
        result.some(item => item.name === 'renamed'))
      expect(items).toHaveLength(5)
      expect(items[2]).toEqual({ id: 'item-2', status: 'open', rank: 2, name: 'renamed' })
      cursor.cleanup()
    })

    it('reflects a reorder', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.updateOne({ id: 'item-4' }, { $set: { rank: -1 } })
      const items = await until(result => result[0]?.id === 'item-4')
      expect(items.map(item => item.id)).toEqual([
        'item-4', 'item-0', 'item-1', 'item-2', 'item-3',
      ])
      cursor.cleanup()
    })

    it('reflects an item dropping out of the query', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.updateOne({ id: 'item-1' }, { $set: { status: 'done' } })
      const items = await until(result => result.length === 4)
      expect(items.map(item => item.id)).toEqual(['item-0', 'item-2', 'item-3', 'item-4'])
      cursor.cleanup()
    })

    it('reflects a removal', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.removeOne({ id: 'item-3' })
      const items = await until(result => result.length === 4)
      expect(items.map(item => item.id)).toEqual(['item-0', 'item-1', 'item-2', 'item-4'])
      cursor.cleanup()
    })

    it('reflects a batch of writes', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.updateMany({ rank: { $lt: 2 } }, { $set: { status: 'done' } })
      const items = await until(result => result.length === 3)
      expect(items.map(item => item.id)).toEqual(['item-2', 'item-3', 'item-4'])
      cursor.cleanup()
    })

    it('keeps several queries on the same collection in step', async () => {
      const openCursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const doneCursor = collection.find({ status: 'done' }, { sort: { rank: 1 } })
      const untilOpen = observe(openCursor)
      const untilDone = observe(doneCursor)
      await untilOpen(result => result.length === 5)
      await untilDone(result => result.length === 0)

      await collection.updateOne({ id: 'item-2' }, { $set: { status: 'done' } })

      const openItems = await untilOpen(result => result.length === 4)
      const doneItems = await untilDone(result => result.length === 1)
      expect(openItems.map(item => item.id))
        .toEqual(['item-0', 'item-1', 'item-3', 'item-4'])
      expect(doneItems.map(item => item.id)).toEqual(['item-2'])
      openCursor.cleanup()
      doneCursor.cleanup()
    })

    it('keeps a limited query correct across writes', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 }, limit: 3 })
      const until = observe(cursor)
      await until(result => result.length === 3)

      await collection.removeOne({ id: 'item-0' })
      const items = await until(result => result[0]?.id === 'item-1')
      expect(items.map(item => item.id)).toEqual(['item-1', 'item-2', 'item-3'])
      cursor.cleanup()
    })

    it('serves a projected query correctly', async () => {
      const cursor = collection.find({ status: 'open' }, { fields: { name: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.updateOne({ id: 'item-1' }, { $set: { name: 'renamed' } })
      const items = await until(result =>
        result.some(item => item.name === 'renamed'))
      expect(items.every(item => item.status === undefined)).toBe(true)
      expect(items.find(item => item.id === 'item-1')).toEqual({ id: 'item-1', name: 'renamed' })
      cursor.cleanup()
    })

    it('agrees with a full re-execution after a long series of writes', async () => {
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 5)

      await collection.insert({ id: 'x', status: 'open', rank: 10, name: 'x' })
      await collection.updateOne({ id: 'item-0' }, { $set: { rank: 99 } })
      await collection.removeOne({ id: 'item-2' })
      await collection.updateOne({ id: 'item-3' }, { $set: { status: 'done' } })
      await collection.insert({ id: 'y', status: 'open', rank: -5, name: 'y' })
      await collection.updateOne({ id: 'x' }, { $set: { name: 'x2' } })

      const expected = await collection.find(
        { status: 'open' },
        { sort: { rank: 1 }, async: true },
      ).fetch()
      const items = await until(result => result.length === expected.length)
      expect(items).toEqual(expected)
      cursor.cleanup()
    })
  })

  describe('what crosses the boundary', () => {
    it('sends a change, not the result, once a query has been answered', async () => {
      await setup(seed(200))
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 200)

      const before = traffic.toClient
      await collection.updateOne({ id: 'item-100' }, { $set: { name: 'renamed' } })
      await until(result => result.some(item => item.name === 'renamed'))
      const sent = traffic.toClient - before

      const fullResultSize = JSON.stringify(seed(200)).length
      expect(sent).toBeLessThan(fullResultSize / 10)
      cursor.cleanup()
    })

    it('costs the same for a large result as for a small one', async () => {
      await setup(seed(400))
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 400)
      const largeBefore = traffic.toClient
      await collection.updateOne({ id: 'item-200' }, { $set: { name: 'renamed' } })
      await until(result => result.some(item => item.name === 'renamed'))
      const largeCost = traffic.toClient - largeBefore
      cursor.cleanup()
      await collection.dispose()

      await setup(seed(20))
      const smallCursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const untilSmall = observe(smallCursor)
      await untilSmall(result => result.length === 20)
      const smallBefore = traffic.toClient
      await collection.updateOne({ id: 'item-10' }, { $set: { name: 'renamed' } })
      await untilSmall(result => result.some(item => item.name === 'renamed'))
      const smallCost = traffic.toClient - smallBefore
      smallCursor.cleanup()

      expect(largeCost).toBeLessThan(smallCost * 2)
    })

    it('sends nothing at all for a write that leaves the query alone', async () => {
      await setup(seed(50))
      const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
      const until = observe(cursor)
      await until(result => result.length === 50)

      const before = traffic.messagesToClient
      await collection.insert({ id: 'other', status: 'archived', rank: 0, name: 'other' })
      const updatesSent = traffic.messagesToClient - before

      // One response for the write itself, and no query update on top of it.
      expect(updatesSent).toBeLessThanOrEqual(1)
      cursor.cleanup()
    })
  })
})

describe('a query the host has to re-execute', () => {
  // A window of one — what `findOne` registers — cannot be answered from its previous result once
  // it is full, so the host announces `'active'`, re-executes, and answers with a delta. That
  // delta is empty whenever the write left the query's result exactly as it was, and the adapter
  // used to drop the whole message on that account: the query stayed `'active'` for good, with no
  // further message coming to correct it. Everything reading `Cursor#isLoading()` afterwards was
  // told a first result was still pending, and stayed there.
  const inertReactivity = createReactivityAdapter({
    create: () => ({ depend: () => {}, notify: () => {} }),
    isInScope: () => true,
  })

  it('settles again after a write that leaves its result unchanged', async () => {
    const pair = createMessagePair()
    const storage = memoryStorageAdapter<TestItem>([
      { id: 'item-0', status: 'open', rank: 0, name: 'name-0' },
      { id: 'item-1', status: 'open', rank: 1, name: 'name-1' },
    ])
    new WorkerDataAdapterHost(pair.hostEndpoint, { id: 'settles', storage: () => storage })
    const adapter = new WorkerDataAdapter(pair.clientEndpoint, { id: 'settles' })
    const collection = new Collection<TestItem>('items', adapter, { reactivity: inertReactivity })
    await Promise.resolve(collection.isReady())

    const cursor = collection.find({ id: 'item-1' }, { limit: 1 })
    const stop = cursor.observeChanges({ added: () => {}, changed: () => {}, removed: () => {} })
    await vi.waitFor(() => {
      expect(cursor.fetch()).toHaveLength(1)
    }, { timeout: 2000, interval: 5 })
    expect(cursor.isLoading()).toBe(false)

    const before = pair.traffic.messagesToClient
    await collection.updateOne({ id: 'item-1' }, { $set: { name: 'name-1' } })
    // The write's own response, the `'active'` announcement, and the answer that follows it.
    await vi.waitFor(() => {
      expect(pair.traffic.messagesToClient).toBeGreaterThanOrEqual(before + 3)
    }, { timeout: 2000, interval: 5 })

    // A fresh cursor, the way a screen mounting after the write reads the same query.
    expect(collection.find({ id: 'item-1' }, { limit: 1 }).isLoading()).toBe(false)

    stop()
    await collection.dispose().catch(() => {})
  })
})
