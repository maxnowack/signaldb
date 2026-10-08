import { describe, test } from 'vitest'
import Collection from '../src/Collection'
import type { CollectionOptions } from '../src/Collection'
import createReactivityAdapter from '../src/createReactivityAdapter'
import Observer from '../src/Collection/Observer'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import DefaultDataAdapter from '../src/DefaultDataAdapter'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import type { WorkerDataAdapterEndpoint } from '../src/WorkerDataAdapter'
import type { WorkerDataAdapterHostEndpoint } from '../src/WorkerDataAdapterHost'
import { diffQueryResults } from '../src/utils/queryDelta'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface BenchItem {
  id: string,
  group: number,
  rank: number,
  name: string,
  payload: string,
}

const ITEM_COUNT = 5000
const QUERY_COUNT = 20

const buildItems = (): BenchItem[] => Array.from({ length: ITEM_COUNT }, (_, index) => ({
  id: `item-${index}`,
  group: index % QUERY_COUNT,
  rank: index,
  name: `name-${index}`,
  payload: `payload-${index}`.repeat(4),
}))

/**
 * Connects a host and an adapter the way a worker is connected to its owner, cloning every message
 * so the serialization a real worker pays for is part of the measurement.
 * @returns The two endpoints.
 */
function createMessagePair() {
  const hostListeners: ((event: MessageEvent) => void)[] = []
  const clientListeners: ((event: MessageEvent) => void)[] = []
  const deliver = (listeners: ((event: MessageEvent) => void)[], data: unknown = null) => {
    const payload = structuredClone(data)
    queueMicrotask(() => {
      for (const listener of listeners) listener({ data: payload } as MessageEvent)
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

/**
 * Opens `QUERY_COUNT` observed cursors over the collection, the way an application with a screenful
 * of live lists would. A write has to be reflected in every one of them, so this is what decides
 * whether a write costs the size of the write or the size of everything on screen.
 * @param collection - The collection to observe.
 * @returns A function that stops all the observers.
 */
function observeQueries(collection: Collection<BenchItem>) {
  const stops = Array.from({ length: QUERY_COUNT }, (_, group) => {
    const cursor = collection.find({ group }, { sort: { rank: 1 } })
    const stop = cursor.observeChanges({
      added: () => {},
      changed: () => {},
      removed: () => {},
      movedBefore: () => {},
    })
    return () => {
      stop()
      cursor.cleanup()
    }
  })
  return () => {
    for (const stop of stops) stop()
  }
}

// Waits until every observed query has settled after a write.
const settle = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 0)
})

describe('a write with 20 live queries over 5000 items', () => {
  test('default adapter', async ({ bench }) => {
    const collection = new Collection<BenchItem>('bench-default', new DefaultDataAdapter())
    await Promise.all(buildItems().map(async item => collection.insert(item)))
    observeQueries(collection)
    let counter = 0

    await bench('update one item', async () => {
      counter += 1
      await collection.updateOne({ id: 'item-2500' }, { $set: { name: `renamed-${counter}` } })
    }).run()
  })

  test('async adapter', async ({ bench }) => {
    const storage = memoryStorageAdapter<BenchItem>(buildItems())
    const collection = new Collection<BenchItem>('bench-async', new AsyncDataAdapter({
      storage: () => storage,
    }))
    await Promise.resolve(collection.isReady())
    observeQueries(collection)
    await settle()
    let counter = 0

    await bench('update one item', async () => {
      counter += 1
      await collection.updateOne({ id: 'item-2500' }, { $set: { name: `renamed-${counter}` } })
      await settle()
    }).run()
  })

  test('worker adapter', async ({ bench }) => {
    const pair = createMessagePair()
    const storage = memoryStorageAdapter<BenchItem>(buildItems())
    new WorkerDataAdapterHost(pair.hostEndpoint, { id: 'bench', storage: () => storage })
    const collection = new Collection<BenchItem>('bench-worker', new WorkerDataAdapter(
      pair.clientEndpoint,
      { id: 'bench' },
    ))
    await Promise.resolve(collection.isReady())
    observeQueries(collection)
    await settle()
    let counter = 0

    await bench('update one item', async () => {
      counter += 1
      await collection.updateOne({ id: 'item-2500' }, { $set: { name: `renamed-${counter}` } })
      await settle()
    }).run()
  })
})

describe('a write with 20 live top-10 lists over 5000 items', () => {
  // The shape a screenful of "latest N" lists has. Each query is a window onto a larger set, which
  // is the case a store cannot answer from the window alone whenever the window loses an item.
  const observeWindows = (collection: Collection<BenchItem>) => {
    Array.from({ length: QUERY_COUNT }, (_, group) => {
      const cursor = collection.find({ group }, { sort: { rank: 1 }, limit: 10 })
      return cursor.observeChanges({
        added: () => {}, changed: () => {}, removed: () => {}, movedBefore: () => {},
      })
    })
  }

  test('async adapter', async ({ bench }) => {
    const storage = memoryStorageAdapter<BenchItem>(buildItems())
    const collection = new Collection<BenchItem>('bench-window-async', new AsyncDataAdapter({
      storage: () => storage,
    }))
    await Promise.resolve(collection.isReady())
    observeWindows(collection)
    await settle()
    let counter = 0

    await bench('update an item inside the windows', async () => {
      counter += 1
      await collection.updateOne({ id: 'item-5' }, { $set: { name: `renamed-${counter}` } })
      await settle()
    }).run()
  })

  test('worker adapter', async ({ bench }) => {
    const pair = createMessagePair()
    const storage = memoryStorageAdapter<BenchItem>(buildItems())
    new WorkerDataAdapterHost(pair.hostEndpoint, { id: 'bench-window', storage: () => storage })
    const collection = new Collection<BenchItem>('bench-window', new WorkerDataAdapter(
      pair.clientEndpoint,
      { id: 'bench-window' },
    ))
    await Promise.resolve(collection.isReady())
    observeWindows(collection)
    await settle()
    let counter = 0

    await bench('update an item inside the windows', async () => {
      counter += 1
      await collection.updateOne({ id: 'item-5' }, { $set: { name: `renamed-${counter}` } })
      await settle()
    }).run()
  })
})

describe('a write with one live query holding all 5000 items', () => {
  // The shape that hurts most: everything the write touches is in one result, so any step that
  // costs the size of the result is paid in full on every write.
  test('worker adapter', async ({ bench }) => {
    const pair = createMessagePair()
    const storage = memoryStorageAdapter<BenchItem>(buildItems())
    new WorkerDataAdapterHost(pair.hostEndpoint, { id: 'bench-wide', storage: () => storage })
    const collection = new Collection<BenchItem>('bench-wide', new WorkerDataAdapter(
      pair.clientEndpoint,
      { id: 'bench-wide' },
    ))
    await Promise.resolve(collection.isReady())
    const cursor = collection.find({}, { sort: { rank: 1 } })
    cursor.observeChanges({
      added: () => {}, changed: () => {}, removed: () => {}, movedBefore: () => {},
    })
    await settle()
    let counter = 0

    await bench('update one item', async () => {
      counter += 1
      await collection.updateOne({ id: 'item-2500' }, { $set: { name: `renamed-${counter}` } })
      await settle()
    }).run()
  })
})

test('a reactive read of a live query holding all 5000 items', async ({ bench }) => {
  // What every render of a screen showing the list pays. The query is already observed, so a read
  // only has to hand over the result and register a dependency.
  const disposers: (() => void)[] = []
  const reactivity = createReactivityAdapter({
    create: () => ({ depend: () => {}, notify: () => {} }),
    isInScope: () => true,
    onDispose: (dispose) => {
      disposers.push(dispose)
    },
  })
  const observedCursor = async (options: CollectionOptions<BenchItem, string, BenchItem>) => {
    const collection = new Collection<BenchItem>('bench-read', new DefaultDataAdapter(), {
      ...options,
      reactivity,
    })
    await Promise.all(buildItems().map(async item => collection.insert(item)))
    const cursor = collection.find({}, { sort: { rank: 1 } })
    cursor.observeChanges({ added: () => {} })
    return cursor
  }
  const cursor = await observedCursor({})
  // A transformAll hands out fresh objects on every read, so nothing is recognized by identity.
  const transformedCursor = await observedCursor({
    transformAll: items => items.map(item => ({ ...item })),
  })

  await bench.compare(
    bench('fetch', () => {
      cursor.fetch()
      for (const dispose of disposers.splice(0)) dispose()
    }),
    bench('fetch with transformAll', () => {
      transformedCursor.fetch()
      for (const dispose of disposers.splice(0)) dispose()
    }),
  )
})

test('learning what changed in a 5000 item result', async ({ bench }) => {
  const previous = buildItems()
  const next = previous.map((item, index) =>
    (index === 2500 ? { ...item, name: 'renamed' } : item))
  // What arrives over a worker boundary: the same values, but every one of them a fresh object, so
  // nothing can be recognized as unchanged by identity alone.
  const nextCloned = structuredClone(next)
  const delta = diffQueryResults(previous, next)

  const buildObserver = () => {
    const observer = new Observer<BenchItem>(() => () => {})
    observer.addCallbacks({
      added: () => {},
      changed: () => {},
      removed: () => {},
      movedBefore: () => {},
    })
    observer.runChecks(() => previous)
    return observer
  }

  await bench.compare(
    bench('by comparing against the new result', () => {
      buildObserver().runChecks(() => nextCloned)
    }),
    bench('by applying a delta', () => {
      buildObserver().applyDelta(delta, () => nextCloned)
    }),
  )
})
