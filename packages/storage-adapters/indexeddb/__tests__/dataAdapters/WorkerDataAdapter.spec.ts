// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { Collection, WorkerDataAdapter, WorkerDataAdapterHost } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
import prepareIndexedDB from '../../src'
import { waitForLocalInsert } from '../../../__tests__/dataAdapters/waitForLocalInsert'

type Item = { id: string, name: string }

type StorageFactory = (name: string) => ReturnType<ReturnType<typeof prepareIndexedDB>>

/**
 * @param prefix Prefix for the generated name.
 * @returns Randomized name.
 */
function randomName(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 1e12).toString(16)}`
}

/**
 * @param schema IndexedDB schema definition.
 * @returns Storage adapter factory for the test.
 */
function createStorageFactory(schema: Record<string, string[]>): StorageFactory {
  const databaseName = randomName('db')
  const indexedDBFactory = prepareIndexedDB({
    databaseName,
    version: 1,
    schema,
  })
  return (name: string) => indexedDBFactory<Item, string>(name)
}

/**
 * @returns In-memory worker loop for testing.
 */
function createWorkerLoop() {
  const workerListeners: ((event: MessageEvent) => void)[] = []
  const listenerMap = new Map<EventListenerOrEventListenerObject, (event: MessageEvent) => void>()
  let hostListener: ((event: MessageEvent) => void) | null = null

  const worker: Worker = {
    onmessage: null,
    onmessageerror: null,
    onerror: null,
    terminate: vi.fn(),
    dispatchEvent: vi.fn(() => false),
    postMessage: vi.fn((payload: any) => {
      queueMicrotask(() => {
        hostListener?.({ data: payload } as MessageEvent)
      })
    }) as unknown as Worker['postMessage'],
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'message') return
      const handler: (event: MessageEvent) => void = typeof listener === 'function'
        ? (event) => {
          listener(event)
        }
        : (event) => {
          listener.handleEvent(event)
        }
      listenerMap.set(listener, handler)
      workerListeners.push(handler)
    }) as unknown as Worker['addEventListener'],
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'message') return
      const handler = listenerMap.get(listener)
      if (!handler) return
      const index = workerListeners.indexOf(handler)
      if (index !== -1) workerListeners.splice(index, 1)
      listenerMap.delete(listener)
    }) as unknown as Worker['removeEventListener'],
  }

  const workerContext = {
    addEventListener: (type: 'message', listener: (event: MessageEvent) => any) => {
      if (type !== 'message') return
      hostListener = listener
    },
    postMessage: (payload: any) => {
      queueMicrotask(() => {
        workerListeners.forEach(listener => listener({ data: payload } as MessageEvent))
      })
    },
  }

  return { worker, workerContext }
}

beforeAll(() => {
  ;(globalThis as any).addEventListener = () => {}
  ;(globalThis as any).postMessage = () => {}
})

afterAll(() => {
  delete (globalThis as any).addEventListener
  delete (globalThis as any).postMessage
})

describe('indexeddb storage adapter + WorkerDataAdapter', () => {
  it('supports basic collection CRUD', async () => {
    const storage = createStorageFactory({ items: [] })
    const { worker, workerContext } = createWorkerLoop()
    new WorkerDataAdapterHost(workerContext, { id: 'worker', storage })
    const adapter = new WorkerDataAdapter(worker, { id: 'worker' })
    const collection = new Collection<Item, string>('items', adapter)

    await collection.ready()
    await collection.insert({ id: '1', name: 'Ada' })
    await collection.insert({ id: '2', name: 'Bob' })

    const items = await collection.find({}, { async: true }).fetch()
    expect(items.map(item => item.name).toSorted()).toEqual(['Ada', 'Bob'])

    await collection.dispose()
  })

  it('syncs with SyncManager using the same data/storage', async () => {
    const syncId = `sync-${Math.floor(Math.random() * 1e12).toString(16)}`
    const storage = createStorageFactory({
      items: [],
      [`${syncId}-changes`]: ['collectionName'],
      [`${syncId}-snapshots`]: ['collectionName'],
      [`${syncId}-sync-operations`]: ['collectionName', 'status'],
    })
    const { worker, workerContext } = createWorkerLoop()
    new WorkerDataAdapterHost(workerContext, { id: 'worker', storage })
    const adapter = new WorkerDataAdapter(worker, { id: 'worker' })
    const remoteItem: Item = { id: '1', name: 'Remote' }
    const localItem: Item = { id: '2', name: 'Local' }
    let pullCalls = 0

    const pull = vi.fn(async (
      _collectionOptions: { name: string },
      _pullParameters: { lastFinishedSyncStart?: number, lastFinishedSyncEnd?: number },
    ): Promise<{ items: Item[] }> => {
      void _collectionOptions
      void _pullParameters
      pullCalls += 1
      if (pullCalls <= 2) return { items: [remoteItem] }
      return { items: [remoteItem, localItem] }
    })
    const push = vi.fn(async (
      _collectionOptions: { name: string },
      _pushParameters: { rawChanges: any[], changes: any },
    ): Promise<void> => {
      void _collectionOptions
      void _pushParameters
    })

    const syncManager = new SyncManager<Record<string, unknown>, Item, string>({
      id: syncId,
      dataAdapter: adapter,
      pull,
      push,
      autostart: false,
    })

    const collection = new Collection<Item, string>('items', adapter)
    syncManager.addCollection(collection, { name: 'items' })

    await collection.ready()
    await syncManager.sync('items')

    expect(pull).toHaveBeenCalled()
    expect(pull.mock.calls[0]?.[0]).toEqual({ name: 'items' })

    let items = await collection.find({}, { async: true }).fetch()
    expect(items).toEqual([remoteItem])

    await collection.insert(localItem)
    await waitForLocalInsert(syncManager, 'items', localItem.id)
    await syncManager.sync('items')

    expect(push).toHaveBeenCalledTimes(1)
    const pushArguments = push.mock.calls[0]
    expect(pushArguments?.[0]).toEqual({ name: 'items' })
    expect(pushArguments?.[1]?.changes?.added).toEqual([localItem])
    expect(pushArguments?.[1]?.changes?.modified).toEqual([])
    expect(pushArguments?.[1]?.changes?.removed).toEqual([])
    expect(pushArguments?.[1]?.rawChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'insert', data: localItem }),
      ]),
    )

    items = await collection.find({}, { async: true }).fetch()
    expect(items.map(item => item.name).toSorted()).toEqual(['Local', 'Remote'])

    await syncManager.dispose()
  })
})
