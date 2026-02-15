// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Collection, AsyncDataAdapter } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
import createLocalStorageAdapter from '../../src'
import { waitForLocalInsert } from '../../../__tests__/dataAdapters/waitForLocalInsert'

type Item = { id: string, name: string }

type StorageFactory = (name: string) => ReturnType<typeof createLocalStorageAdapter<Item, string>>

/**
 * @param prefix Prefix for the generated name.
 * @returns Randomized name.
 */
function randomName(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 1e12).toString(16)}`
}

/**
 * @returns Storage adapter factory for the test.
 */
function createStorageFactory(): StorageFactory {
  const databaseName = randomName('db')
  return (name: string) => createLocalStorageAdapter<Item, string>(name, { databaseName })
}

describe('localstorage adapter + AsyncDataAdapter', () => {
  it('supports basic collection CRUD', async () => {
    const storage = createStorageFactory()
    const adapter = new AsyncDataAdapter({ storage })
    const collection = new Collection<Item, string>('items', adapter)

    await collection.ready()
    await collection.insert({ id: '1', name: 'Ada' })
    await collection.insert({ id: '2', name: 'Bob' })

    const items = await collection.find({}, { async: true }).fetch()
    expect(items.map(item => item.name).toSorted()).toEqual(['Ada', 'Bob'])

    await collection.dispose()
  })

  it('syncs with SyncManager using the same data/storage', async () => {
    const storage = createStorageFactory()
    const adapter = new AsyncDataAdapter({ storage })
    const syncId = `sync-${Math.floor(Math.random() * 1e12).toString(16)}`
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
    await collection.dispose()
  })
})
