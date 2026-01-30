import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Collection, AutoFetchDataAdapter } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
import createFilesystemAdapter from '../../src'
import { waitForLocalInsert } from '../../../__tests__/dataAdapters/waitForLocalInsert'

type Item = { id: string, name: string }

type StorageFactory = (name: string) => ReturnType<typeof createFilesystemAdapter<Item, string>>

const cleanupPaths: string[] = []

/**
 * @returns Storage adapter factory for the test.
 */
async function createStorageFactory(): Promise<StorageFactory> {
  const root = await mkdtemp(path.join(tmpdir(), 'signaldb-fs-data-adapters-'))
  cleanupPaths.push(root)
  return name => createFilesystemAdapter<Item, string>(path.join(root, name))
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  )
})

describe('filesystem storage adapter + AutoFetchDataAdapter', () => {
  it('supports basic collection CRUD', async () => {
    const storage = await createStorageFactory()
    const adapter = new AutoFetchDataAdapter({
      storage,
      fetchQueryItems: async () => [],
    })
    const collection = new Collection<Item, string>('items', adapter)

    await collection.ready()
    await collection.insert({ id: '1', name: 'Ada' })
    await collection.insert({ id: '2', name: 'Bob' })

    const items = await collection.find({}, { async: true }).fetch()
    expect(items.map(item => item.name).toSorted()).toEqual(['Ada', 'Bob'])

    await collection.dispose()
  })

  it('syncs with SyncManager using the same data/storage', async () => {
    const storage = await createStorageFactory()
    const adapter = new AutoFetchDataAdapter({
      storage,
      fetchQueryItems: async () => [],
    })
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
