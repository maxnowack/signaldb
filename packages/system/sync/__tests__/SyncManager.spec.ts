/* @vitest-environment happy-dom */
import { it, expect, vi } from 'vitest'
import { Collection, createPersistenceAdapter } from '@signaldb/core'
import type { BaseItem, LoadResponse, PersistenceAdapter } from '@signaldb/core'
import { SyncManager } from '../src'

function memoryPersistenceAdapter<
  T extends { id: I } & Record<string, any>,
  I = any,
>(
  initialData: T[] = [],
  transmitChanges = false,
  delay: number | undefined = undefined,
) {
  // not really a "persistence adapter", but it works for testing
  let items = [...initialData]
  const changes: {
    added: T[],
    modified: T[],
    removed: T[],
  } = {
    added: [],
    modified: [],
    removed: [],
  }
  let onChange: () => void | Promise<void> = () => { /* do nothing */ }
  return {
    register: (changeCallback: () => void | Promise<void>) => {
      onChange = changeCallback
      return Promise.resolve()
    },
    load: async () => {
      const currentChanges = { ...changes }
      changes.added = []
      changes.modified = []
      changes.removed = []
      const hasChanges = currentChanges.added.length > 0
        || currentChanges.modified.length > 0
        || currentChanges.removed.length > 0
      if (delay != null) await new Promise((resolve) => { setTimeout(resolve, delay) })
      if (transmitChanges && hasChanges) {
        return Promise.resolve({ changes: currentChanges })
      }
      return Promise.resolve({ items })
    },
    save: (newSnapshot: T[]) => {
      items = [...newSnapshot]
      return Promise.resolve()
    },
    addNewItem: (item: T) => {
      items.push(item)
      changes.added.push(item)
      void onChange()
    },
    changeItem: (item: T) => {
      items = items.map(i => (i.id === item.id ? item : i))
      changes.modified.push(item)
      void onChange()
    },
    removeItem: (item: T) => {
      items = items.filter(i => i.id !== item.id)
      changes.removed.push(item)
      void onChange()
    },
  } as (PersistenceAdapter<T, I> & {
    addNewItem: (item: T) => void,
    changeItem: (item: T) => void,
    removeItem: (item: T) => void,
  })
}

interface TestItem extends BaseItem<string> {
  id: string,
  name: string,
}

it('should add a collection and register sync events', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  mockCollection.insert({ id: '2', name: 'New Item' })

  await new Promise((resolve) => { setTimeout(resolve, 110) })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
})

it('should handle pull and apply new changes during sync', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  await syncManager.sync('test')

  expect(onError).not.toHaveBeenCalled()
  expect(mockPull).toHaveBeenCalled()
  expect(mockCollection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should handle updates correctly during sync', async () => {
  let callCount = 0
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockImplementation(() => {
    callCount += 1
    if (callCount === 1) {
      return Promise.resolve({
        items: [{ id: '1', name: 'Test Item' }],
      })
    }
    return Promise.resolve({
      items: [{ id: '1', name: 'New Item' }],
    })
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  await syncManager.sync('test')
  expect(mockCollection.findOne({ id: '1' })?.name).toBe('Test Item')

  mockCollection.updateOne({ id: '1' }, { $set: { name: 'New Item' } })
  await syncManager.sync('test')

  expect(onError).not.toHaveBeenCalled()
  expect(mockCollection.findOne({ id: '1' })?.name).toBe('New Item')
})

it('should push changes when items are added locally', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  mockCollection.insert({ id: '2', name: 'New Item' })

  await new Promise((resolve) => { setTimeout(resolve, 110) })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
})

it('should push changes when items are updated locally', async () => {
  let callCount = 0
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockImplementation(() => {
    callCount += 1
    if (callCount === 1) {
      return Promise.resolve({
        items: [{ id: '1', name: 'Test Item' }],
      })
    }
    return Promise.resolve({
      items: [{ id: '1', name: 'New Item' }],
    })
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  await syncManager.sync('test')

  mockCollection.updateOne({ id: '1' }, { $set: { name: 'Updated Locally' } })
  await new Promise((resolve) => { setTimeout(resolve, 110) })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
  expect(mockCollection.findOne({ id: '1' })?.name).toBe('New Item')
})

it('should push changes when items are removed locally', async () => {
  let callCount = 0
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockImplementation(() => {
    callCount += 1
    if (callCount <= 2) {
      return Promise.resolve({
        items: [{ id: '1', name: 'Test Item' }],
      })
    }
    return Promise.resolve({
      items: [],
    })
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  await syncManager.sync('test')

  mockCollection.removeOne({ id: '1' })
  await new Promise((resolve) => { setTimeout(resolve, 110) })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
  expect(mockCollection.findOne({ id: '1' })).toBeUndefined()
})

it('should debounce push requests', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  mockCollection.insert({ id: '2', name: 'First Item' })
  mockCollection.insert({ id: '3', name: 'Second Item' })

  await new Promise((resolve) => { setTimeout(resolve, 110) })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it('should handle sync errors and update sync operation status', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockRejectedValue(new Error('Sync failed'))

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  await expect(syncManager.sync('test')).rejects.toThrow()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Sync failed'))
  const syncOperation = syncManager.isSyncing('test')
  expect(syncOperation).toBe(false)
})

it('should sync all collections', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection1 = new Collection<TestItem, string, any>()
  const mockCollection2 = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection1, { name: 'test1' })
  syncManager.addCollection(mockCollection2, { name: 'test2' })

  await syncManager.syncAll()

  expect(onError).not.toHaveBeenCalled()
  expect(mockPull).toHaveBeenCalledTimes(2)
})

it('should handle pull errors and update sync operation status', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockRejectedValue(new Error('Pull failed'))

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  await expect(syncManager.sync('test')).rejects.toThrowError('Pull failed')

  const syncOperation = syncManager.isSyncing('test')
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Pull failed'))
  expect(syncOperation).toBe(false)
})

it('should handle pull errors and update sync operation status after first sync', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({ items: [] })
  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  mockPull.mockImplementation(() => {
    if (mockPull.mock.calls.length === 1) {
      mockCollection.insert({ id: '1', name: 'Test Item' })
      return Promise.resolve({ items: [] })
    }
    return Promise.reject(new Error('Pull failed'))
  })

  await expect(syncManager.sync('test')).rejects.toThrowError('Pull failed')

  const syncOperation = syncManager.isSyncing('test')
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Pull failed'))
  expect(syncOperation).toBe(false)
})

it('should handle push errors and update sync operation status', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockRejectedValue(new Error('Push failed'))
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  mockCollection.insert({ id: '2', name: 'New Item' })

  await expect(syncManager.sync('test')).rejects.toThrow('Push failed')

  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Push failed'))
  const syncOperation = syncManager.isSyncing('test')
  expect(syncOperation).toBe(false)
})

it('should register and apply remote changes with items', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  let onRemoteChangeHandler = vi.fn<(data?: LoadResponse<TestItem>) => void>()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    registerRemoteChange: (_options, onRemoteChange) => {
      onRemoteChangeHandler = vi.fn().mockImplementation(onRemoteChange)
    },
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  // Simulate a remote change
  onRemoteChangeHandler({ items: [{ id: '2', name: 'Remote Item' }] })

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(mockCollection.find().fetch()).toEqual([{ id: '2', name: 'Remote Item' }])
})

it('should register and apply remote changes with changes', async () => {
  let callCount = 0
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockImplementation(() => {
    callCount += 1
    if (callCount <= 1) {
      return Promise.resolve({ items: [{ id: '1', name: 'Test Item' }] })
    }
    return Promise.resolve({ changes: { added: [], modified: [], removed: [] } })
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  let onRemoteChangeHandler = vi.fn<(data?: LoadResponse<TestItem>) => void>()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    registerRemoteChange: (_options, onRemoteChange) => {
      onRemoteChangeHandler = vi.fn().mockImplementation(onRemoteChange)
    },
  })

  const mockCollection = new Collection<TestItem, string, any>()
  syncManager.addCollection(mockCollection, { name: 'test' })
  await syncManager.sync('test')

  // Simulate a remote change
  onRemoteChangeHandler({ changes: { added: [{ id: '2', name: 'Remote Item' }], modified: [], removed: [] } })

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(mockCollection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }, { id: '2', name: 'Remote Item' }])
})

it('should handle error in remote changes without data', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockRejectedValue(new Error('Pull failed'))

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  const onRemoteChangeHandler = vi.fn<(data?: LoadResponse<TestItem>) => void | Promise<void>>()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    registerRemoteChange: (_options, onRemoteChange) => {
      onRemoteChangeHandler.mockImplementation(onRemoteChange)
    },
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  // Simulate a remote change
  await expect(onRemoteChangeHandler()).rejects.toThrow('Pull failed')
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Pull failed'))
})

it('should handle error in remote changes with data', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockRejectedValue(new Error('Pull failed'))

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  const onRemoteChangeHandler = vi.fn<(data?: LoadResponse<TestItem>) => void | Promise<void>>()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    registerRemoteChange: (_options, onRemoteChange) => {
      onRemoteChangeHandler.mockImplementation(onRemoteChange)
    },
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  // Simulate a remote change
  const promise = onRemoteChangeHandler({ items: [{ id: '2', name: 'Remote Item' }] })
  mockCollection.insert({ id: '1', name: 'Test Item' })
  await expect(promise).rejects.toThrow('Pull failed')
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Pull failed'))
})

it('should sync second time if there were changes during sync', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  const onRemoteChangeHandler = vi.fn<(data?: LoadResponse<TestItem>) => void | Promise<void>>()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    registerRemoteChange: (_options, onRemoteChange) => {
      onRemoteChangeHandler.mockImplementation(onRemoteChange)
    },
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  // Simulate a remote change
  const promise = onRemoteChangeHandler({ items: [{ id: '2', name: 'Remote Item' }] })
  mockCollection.insert({ id: '1', name: 'Test Item' })
  await expect(promise).resolves.not.toThrow()
  expect(onError).toHaveBeenCalledTimes(0)

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(mockCollection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should sync after a empty remote change was received', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  let onRemoteChangeHandler = vi.fn<(data?: LoadResponse<TestItem>) => void>()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    registerRemoteChange: (_options, onRemoteChange) => {
      onRemoteChangeHandler = vi.fn().mockImplementation(onRemoteChange)
    },
  })
  await syncManager.isReady()

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  // Simulate a remote change
  onRemoteChangeHandler()

  // wait until sync finished
  await new Promise((resolve) => { setTimeout(resolve, 100) })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(mockCollection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should call onError handler if an async error occurs', async () => {
  let callCount = 0
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockImplementation(() => {
    callCount += 1
    if (callCount === 1) {
      return Promise.resolve({
        items: [{ id: '1', name: 'Test Item' }],
      })
    }
    return Promise.resolve({
      items: [{ id: '1', name: 'New Item' }],
    })
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockRejectedValue(new Error('Push failed'))

  const onError = vi.fn()
  const syncManager = new SyncManager({
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    onError,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  await syncManager.sync('test')

  mockCollection.updateOne({ id: '1' }, { $set: { name: 'Updated Locally' } })
  await new Promise((resolve) => { setTimeout(resolve, 110) })

  expect(mockPush).toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Push failed'))
})

it('should fail if there are errors on syncAll and call onError handler', async () => {
  const mockPull = vi.fn<(options: { name: string }) => Promise<LoadResponse<TestItem>>>()
    .mockImplementation(({ name }) => {
      if (name === 'collection2') return Promise.reject(new Error('failed'))
      return Promise.resolve({
        items: [{ id: '1', name: 'Test Item' }],
      })
    })
  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()

  const onError = vi.fn()
  const syncManager = new SyncManager({
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    onError,
  })

  const collection1 = new Collection<TestItem, string, any>()
  const collection2 = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection1, { name: 'collection1' })
  syncManager.addCollection(collection2, { name: 'collection2' })

  await expect(syncManager.syncAll()).rejects.toThrow('failed')
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'collection2' }, new Error('failed'))
})

it('should call onError once if there are errors on forced sync', async () => {
  const mockPull = vi.fn<(options: { name: string }) => Promise<LoadResponse<TestItem>>>()
    .mockRejectedValue(new Error('failed'))
  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()

  const onError = vi.fn()
  const syncManager = new SyncManager({
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    onError,
  })

  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })

  await expect(syncManager.sync('test', { force: true })).rejects.toThrow('failed')
  expect(onError).toHaveBeenCalledTimes(1)
})

it('should update items that already exist on insert', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  const collection = new Collection<TestItem, string, any>()
  collection.insert({ id: '1', name: 'Local Test Item' })
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  syncManager.addCollection(collection, { name: 'test' })
  await expect(syncManager.sync('test')).resolves.toBeUndefined()

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(collection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should insert items that not exist on update', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    changes: { modified: [{ id: '1', name: 'Test Item' }], added: [], removed: [] },
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  const collection = new Collection<TestItem, string, any>()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  syncManager.addCollection(collection, { name: 'test' })
  await expect(syncManager.sync('test')).resolves.toBeUndefined()

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(collection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should not fail while removing non existing items', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    changes: { removed: [{ id: '1', name: 'Test Item' }], added: [], modified: [] },
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()

  const collection = new Collection<TestItem, string, any>()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  syncManager.addCollection(collection, { name: 'test' })
  await expect(syncManager.sync('test')).resolves.toBeUndefined()

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(collection.find().fetch()).toEqual([])
})

it('should clear all internal data structures on dispose', async () => {
  const syncManager = new SyncManager<any, any>({
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: vi.fn(),
    push: vi.fn(),
  })
  const collection = new Collection<TestItem, string, any>()
  await syncManager.isReady()
  syncManager.addCollection(collection, { name: 'test' })

  // @ts-expect-error - private property
  expect(syncManager.collections.size).toBe(1)

  await syncManager.dispose()

  // @ts-expect-error - private property
  expect(syncManager.collections.size).toBe(0)
  // @ts-expect-error - private property
  expect(syncManager.syncQueues.size).toBe(0)
  // @ts-expect-error - private property
  expect(() => syncManager.changes.insert({})).toThrowError('Collection is disposed')
  // @ts-expect-error - private property
  expect(() => syncManager.snapshots.insert({})).toThrowError('Collection is disposed')
  // @ts-expect-error - private property
  expect(() => syncManager.syncOperations.insert({})).toThrowError('Collection is disposed')
})

it('should register error handlers for internal persistence adapters', async () => {
  const errorHandler = vi.fn()
  const syncManager = new SyncManager<any, any>({
    persistenceAdapter: (name, registerErrorHandler) => {
      registerErrorHandler(errorHandler)
      if (name === 'default-sync-manager-changes') {
        return createPersistenceAdapter({
          load: () => Promise.resolve({ items: [] }),
          register: () => Promise.resolve(),
          save: () => Promise.reject(new Error('simulated error')),
        })
      }
      return memoryPersistenceAdapter([])
    },
    pull: vi.fn(),
    push: vi.fn(),
  })

  const collection = new Collection<TestItem, string, any>()
  await syncManager.isReady()
  syncManager.addCollection(collection, { name: 'test' })

  collection.insert({ id: '1', name: 'Test Item' })

  // wait to next tick
  await new Promise((resolve) => { setTimeout(resolve, 0) })

  expect(errorHandler).toHaveBeenCalledWith(new Error('simulated error'))
})

it('should not leave any remote changes after successful pull', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [
      { id: '1', name: 'Test Item' },
      { id: '2', name: 'Test Item 2' },
      { id: '3', name: 'Test Item 3' },
      { id: '4', name: 'Test Item 4' },
      { id: '5', name: 'Test Item 5' },
    ],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>({
    memory: [
      { id: '1', name: 'Test Item' },
      { id: '2', name: 'Test Item 2' },
      { id: '3', name: 'Test Item 3' },
      { id: '4', name: 'Test Item 4' },
      { id: '5', name: 'Test Item 5' },
    ],
  })

  syncManager.addCollection(mockCollection, { name: 'test' })

  await syncManager.sync('test')

  expect(onError).not.toHaveBeenCalled()
  expect(mockPull).toHaveBeenCalled()
  // @ts-expect-error - private property
  expect(syncManager.remoteChanges.length).toBe(0)
})

it('should reset if syncmanager snapshot and collection are not in sync', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [
      { id: '1', name: 'Test Item' },
      { id: '2', name: 'Test Item 2' },
    ],
  })

  const mockPush = vi.fn<(options: any, pushParams: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>({
    memory: [
      { id: '1', name: 'Test Item' },
      { id: 'x', name: 'Test Item 3' },
    ],
  })

  syncManager.addCollection(mockCollection, { name: 'test' })

  await syncManager.sync('test')
  expect(mockCollection.find().fetch()).toEqual([
    { id: '1', name: 'Test Item' },
    { id: '2', name: 'Test Item 2' },
  ])

  // @ts-expect-error - private property
  syncManager.snapshots.updateOne({ collectionName: 'test' }, {
    // monkey patch the snapshot and add one item
    $set: {
      items: [
        { id: '1', name: 'Test Item' },
        { id: '2', name: 'Test Item 2' },
        { id: 'xxx', name: 'Test Item xxx' },
      ],
    },
  })

  await syncManager.sync('test')
  expect(mockCollection.find().fetch()).toEqual([
    { id: '1', name: 'Test Item' },
    { id: '2', name: 'Test Item 2' },
  ])

  expect(onError).not.toHaveBeenCalled()
  expect(mockPull).toHaveBeenCalled()

  // @ts-expect-error - private property
  expect(syncManager.remoteChanges.length).toBe(0)
})
