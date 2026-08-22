import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Collection from '../src/Collection'
import Observer from '../src/Collection/Observer'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import DefaultDataAdapter from '../src/DefaultDataAdapter'
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

const seed = (count: number): TestItem[] => Array.from({ length: count }, (_, index) => ({
  id: `item-${index}`,
  status: 'open',
  rank: index,
  name: `name-${index}`,
}))

/**
 * Connects a host and an adapter through cloned, asynchronously delivered messages.
 * @returns The two endpoints.
 */
function createMessagePair() {
  const hostListeners: ((event: MessageEvent) => void)[] = []
  const clientListeners: ((event: MessageEvent) => void)[] = []
  const deliver = (listeners: ((event: MessageEvent) => void)[], data: unknown) => {
    const payload = structuredClone(data ?? null)
    queueMicrotask(() => {
      [...listeners].forEach(listener => listener({ data: payload } as MessageEvent))
    })
  }
  const hostEndpoint: WorkerDataAdapterHostEndpoint = {
    addEventListener: (type, listener) => {
      if (type === 'message') hostListeners.push(listener as (event: MessageEvent) => void)
    },
    postMessage: message => deliver(clientListeners, message),
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
    postMessage: message => deliver(hostListeners, message),
    terminate: () => {},
  }
  return { hostEndpoint, clientEndpoint }
}

const adapters = {
  /**
   * Builds a collection backed by the in-memory default adapter.
   * @param items - The items the collection starts with.
   * @returns The collection.
   */
  default: async (items: TestItem[]) => {
    const collection = new Collection<TestItem>('items', new DefaultDataAdapter())
    await Promise.resolve(collection.isReady())
    await Promise.all(items.map(async item => collection.insert(item)))
    return collection
  },
  /**
   * Builds a collection backed by the async adapter over an in-memory storage.
   * @param items - The items the collection starts with.
   * @returns The collection.
   */
  async: async (items: TestItem[]) => {
    const storage = memoryStorageAdapter<TestItem>(items.map(item => ({ ...item })))
    const collection = new Collection<TestItem>('items', new AsyncDataAdapter({
      storage: () => storage,
    }))
    await Promise.resolve(collection.isReady())
    return collection
  },
  /**
   * Builds a collection backed by a real worker host and adapter pair.
   * @param items - The items the collection starts with.
   * @returns The collection.
   */
  worker: async (items: TestItem[]) => {
    const pair = createMessagePair()
    const storage = memoryStorageAdapter<TestItem>(items.map(item => ({ ...item })))

    new WorkerDataAdapterHost(pair.hostEndpoint, { id: 'cursor-delta', storage: () => storage })
    const collection = new Collection<TestItem>('items', new WorkerDataAdapter(
      pair.clientEndpoint,
      { id: 'cursor-delta' },
    ))
    await Promise.resolve(collection.isReady())
    return collection
  },
}

describe.each(Object.keys(adapters) as (keyof typeof adapters)[])('cursor updates over the %s adapter', (adapterName) => {
  let collection: Collection<TestItem>
  let runChecks: ReturnType<typeof vi.spyOn>
  let applyDelta: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    collection = await adapters[adapterName](seed(20))
    runChecks = vi.spyOn(Observer.prototype, 'runChecks')
    applyDelta = vi.spyOn(Observer.prototype, 'applyDelta')
  })

  afterEach(async () => {
    runChecks.mockRestore()
    applyDelta.mockRestore()
    await collection.dispose().catch(() => {})
  })

  const observed = (selector: Record<string, any>, options?: Record<string, any>) => {
    const cursor = collection.find(selector, options)
    const stop = cursor.observeChanges({ added: () => {}, changed: () => {}, removed: () => {} })
    return {
      cursor,
      stop,
      until: async (predicate: (items: TestItem[]) => boolean) => {
        let current: TestItem[] = []
        await vi.waitFor(() => {
          current = cursor.fetch()
          expect(predicate(current)).toBe(true)
        }, { timeout: 2000, interval: 5 })
        return current
      },
    }
  }

  it('brings an update to the cursor as a change, not as a fresh comparison', async () => {
    const { stop, until } = observed({ status: 'open' }, { sort: { rank: 1 } })
    await until(items => items.length === 20)

    runChecks.mockClear()
    applyDelta.mockClear()
    await collection.updateOne({ id: 'item-5' }, { $set: { name: 'renamed' } })
    await until(items => items.some(item => item.name === 'renamed'))

    expect(applyDelta).toHaveBeenCalled()
    expect(applyDelta.mock.results.every((result: { value: unknown }) => result.value === true))
      .toBe(true)
    expect(runChecks).not.toHaveBeenCalled()
    stop()
  })

  it('reports exactly the item that changed', async () => {
    const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
    const changed = vi.fn()
    const added = vi.fn()
    const removed = vi.fn()
    const stop = cursor.observeChanges({ changed, added, removed }, true)
    await vi.waitFor(() => expect(cursor.fetch()).toHaveLength(20))
    ;[changed, added, removed].forEach(callback => callback.mockClear())

    await collection.updateOne({ id: 'item-5' }, { $set: { name: 'renamed' } })
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())

    expect(changed).toHaveBeenCalledExactlyOnceWith(
      { id: 'item-5', status: 'open', rank: 5, name: 'renamed' },
    )
    expect(added).not.toHaveBeenCalled()
    expect(removed).not.toHaveBeenCalled()
    stop()
  })

  it('reports exactly the item that was added', async () => {
    const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
    const added = vi.fn()
    const addedBefore = vi.fn()
    const stop = cursor.observeChanges({ added, addedBefore }, true)
    await vi.waitFor(() => expect(cursor.fetch()).toHaveLength(20))
    ;[added, addedBefore].forEach(callback => callback.mockClear())

    const item = { id: 'new', status: 'open', rank: -1, name: 'first' }
    await collection.insert(item)
    await vi.waitFor(() => expect(added).toHaveBeenCalled())

    expect(added).toHaveBeenCalledExactlyOnceWith(item)
    expect(addedBefore).toHaveBeenCalledExactlyOnceWith(item, expect.objectContaining({ id: 'item-0' }))
    stop()
  })

  it('reports exactly the item that was removed', async () => {
    const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
    const removed = vi.fn()
    const stop = cursor.observeChanges({ removed }, true)
    await vi.waitFor(() => expect(cursor.fetch()).toHaveLength(20))
    removed.mockClear()

    await collection.removeOne({ id: 'item-7' })
    await vi.waitFor(() => expect(removed).toHaveBeenCalled())

    expect(removed).toHaveBeenCalledExactlyOnceWith(
      { id: 'item-7', status: 'open', rank: 7, name: 'name-7' },
    )
    stop()
  })

  it('falls back to a comparison for a query whose window may have shifted', async () => {
    const { stop, until } = observed({ status: 'open' }, { sort: { rank: 1 }, limit: 5 })
    await until(items => items.length === 5)

    await collection.removeOne({ id: 'item-0' })
    const items = await until(result => result[0]?.id === 'item-1')

    expect(items.map(item => item.id)).toEqual([
      'item-1', 'item-2', 'item-3', 'item-4', 'item-5',
    ])
    stop()
  })

  it('stays correct through a series of writes', async () => {
    const { stop, until } = observed({ status: 'open' }, { sort: { rank: 1 } })
    await until(items => items.length === 20)

    await collection.insert({ id: 'x', status: 'open', rank: 100, name: 'x' })
    await collection.updateOne({ id: 'item-3' }, { $set: { rank: -5 } })
    await collection.removeOne({ id: 'item-9' })
    await collection.updateOne({ id: 'item-4' }, { $set: { status: 'done' } })
    await collection.updateMany({ rank: { $gt: 15 } }, { $set: { name: 'late' } })

    const expected = await collection.find(
      { status: 'open' },
      { sort: { rank: 1 }, async: true },
    ).fetch()
    const items = await until(result => result.length === expected.length)
    expect(items).toEqual(expected)
    stop()
  })
})

describe('cursor updates for a collection with transformAll', () => {
  let collection: Collection<TestItem>

  beforeEach(async () => {
    const storage = memoryStorageAdapter<TestItem>(seed(5))
    collection = new Collection<TestItem>('transformed', new AsyncDataAdapter({
      storage: () => storage,
    }), {
      transformAll: items => items.map(item => ({ ...item, name: `${item.name ?? ''}!` })),
    })
    await Promise.resolve(collection.isReady())
  })

  afterEach(async () => {
    await collection.dispose().catch(() => {})
  })

  it('still reflects writes, by comparing rather than by applying a change', async () => {
    const cursor = collection.find({ status: 'open' }, { sort: { rank: 1 } })
    const stop = cursor.observeChanges({ added: () => {}, changed: () => {} })
    await vi.waitFor(() => expect(cursor.fetch()).toHaveLength(5))
    expect(cursor.fetch()[0].name).toBe('name-0!')

    await collection.updateOne({ id: 'item-1' }, { $set: { name: 'renamed' } })
    await vi.waitFor(() => expect(cursor.fetch().some(item => item.name === 'renamed!')).toBe(true))

    expect(cursor.fetch()).toHaveLength(5)
    stop()
  })
})
