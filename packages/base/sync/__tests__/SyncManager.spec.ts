/* @vitest-environment happy-dom */
import { it, expect, vi } from 'vitest'
import { Collection, createPersistenceAdapter } from '@signaldb/core'
import type { BaseItem, LoadResponse, PersistenceAdapter } from '@signaldb/core'
import { SyncManager } from '../src'

/**
 * Creates a memory persistence adapter for testing purposes.
 * @param initialData - Initial data to populate the adapter.
 * @param transmitChanges - Whether to transmit changes.
 * @param [delay] - Optional delay for simulating async operations.
 * @returns The memory persistence adapter.
 */
function memoryPersistenceAdapter<
  T extends { id: I } & Record<string, any>,
  I = any,
>(
  initialData: T[] = [],
  transmitChanges = false,
  delay?: number,
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
      if (delay != null) await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
      if (transmitChanges && hasChanges) {
        return { changes: currentChanges }
      }
      return { items }
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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  await mockCollection.insert({ id: '2', name: 'New Item' })

  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
})

it('should handle pull and apply new changes during sync', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  await mockCollection.updateOne({ id: '1' }, { $set: { name: 'New Item' } })
  await syncManager.sync('test')

  expect(onError).not.toHaveBeenCalled()
  expect(mockCollection.findOne({ id: '1' })?.name).toBe('New Item')
})

it('should push changes when items are added locally', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  await mockCollection.insert({ id: '2', name: 'New Item' })

  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  await mockCollection.updateOne({ id: '1' }, { $set: { name: 'Updated Locally' } })
  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  await mockCollection.removeOne({ id: '1' })
  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
  expect(mockCollection.findOne({ id: '1' })).toBeUndefined()
})

it('should debounce push requests', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    debounceTime: 25,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })

  await mockCollection.insert({ id: '2', name: 'First Item' })
  await mockCollection.insert({ id: '3', name: 'Second Item' })

  await new Promise((resolve) => {
    setTimeout(resolve, 50)
  })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it('should debounce push requests for multiple collections', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
    debounceTime: 25,
  })

  const collection1 = new Collection<TestItem, string, any>()
  const collection2 = new Collection<TestItem, string, any>()

  syncManager.addCollection(collection1, { name: 'test1' })
  syncManager.addCollection(collection2, { name: 'test2' })

  await collection1.insert({ id: '1', name: 'Collection 1 Item' })
  await collection2.insert({ id: '2', name: 'Collection 2 Item' })

  // Wait for debounce period to complete
  await new Promise((resolve) => {
    setTimeout(resolve, 50)
  })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledTimes(2)

  const calls = mockPush.mock.calls
  expect(calls.some(call => call[0].name === 'test1')).toBe(true)
  expect(calls.some(call => call[0].name === 'test2')).toBe(true)
})

it('should handle sync errors and update sync operation status', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockRejectedValue(new Error('Sync failed'))

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  mockPull.mockImplementation(async () => {
    if (mockPull.mock.calls.length === 1) {
      await mockCollection.insert({ id: '1', name: 'Test Item' })
      return { items: [] }
    }
    throw new Error('Pull failed')
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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  await mockCollection.insert({ id: '2', name: 'New Item' })

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(mockCollection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }, { id: '2', name: 'Remote Item' }])
})

it('should handle error in remote changes without data', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockRejectedValue(new Error('Pull failed'))

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await mockCollection.insert({ id: '1', name: 'Test Item' })
  await expect(promise).rejects.toThrow('Pull failed')
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith({ name: 'test' }, new Error('Pull failed'))
})

it('should sync second time if there were changes during sync', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await mockCollection.insert({ id: '1', name: 'Test Item' })
  await expect(promise).resolves.not.toThrow()
  expect(onError).toHaveBeenCalledTimes(0)

  // wait to next tick
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

  expect(mockCollection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should sync after a empty remote change was received', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  })

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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

  await mockCollection.updateOne({ id: '1' }, { $set: { name: 'Updated Locally' } })
  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

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
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()

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
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const collection = new Collection<TestItem, string, any>()
  await collection.insert({ id: '1', name: 'Local Test Item' })
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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(collection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should insert items that not exist on update', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    changes: { modified: [{ id: '1', name: 'Test Item' }], added: [], removed: [] },
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

  expect(onError).not.toHaveBeenCalled()
  // Verify that the collection includes the remote change
  expect(collection.find().fetch()).toEqual([{ id: '1', name: 'Test Item' }])
})

it('should not fail while removing non existing items', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    changes: { removed: [{ id: '1', name: 'Test Item' }], added: [], modified: [] },
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

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

  await collection.insert({ id: '1', name: 'Test Item' })

  // wait to next tick
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()
  await mockCollection.insertMany([
    { id: '1', name: 'Test Item' },
    { id: '2', name: 'Test Item 2' },
    { id: '3', name: 'Test Item 3' },
    { id: '4', name: 'Test Item 4' },
    { id: '5', name: 'Test Item 5' },
  ])

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

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    persistenceAdapter: () => memoryPersistenceAdapter([]),
    pull: mockPull,
    push: mockPush,
  })

  const mockCollection = new Collection<TestItem, string, any>()
  await mockCollection.insertMany([
    { id: '1', name: 'Test Item', additionalField: true },
    { id: 'x', name: 'Test Item 3' },
  ])

  syncManager.addCollection(mockCollection, { name: 'test' })

  await syncManager.sync('test')
  expect(mockCollection.find().fetch()).toEqual([
    { id: '1', name: 'Test Item' },
    { id: '2', name: 'Test Item 2' },
  ])

  // @ts-expect-error - private property
  await syncManager.snapshots.updateOne({ collectionName: 'test' }, {
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

it('should start sync after internal collections are ready', async () => {
  const persistenceAdapter = memoryPersistenceAdapter([], undefined, 100)
  const mockPersistenceAdapter = createPersistenceAdapter({
    register: vi.fn(persistenceAdapter.register),
    load: vi.fn(persistenceAdapter.load),
    save: vi.fn(persistenceAdapter.save),
  })
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const syncManager = new SyncManager({
    persistenceAdapter: () => mockPersistenceAdapter,
    pull: mockPull,
    push: mockPush,
  })

  let persistenceInitialized = false
  void Promise.all([
    new Promise((resolve) => {
      // @ts-expect-error - private property
      syncManager.syncOperations.once('persistence.init', resolve)
    }),
    new Promise((resolve) => {
      // @ts-expect-error - private property
      syncManager.changes.once('persistence.init', resolve)
    }),
    new Promise((resolve) => {
      // @ts-expect-error - private property
      syncManager.snapshots.once('persistence.init', resolve)
    }),
  ]).then(() => {
    persistenceInitialized = true
  })

  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })

  expect(mockPersistenceAdapter.load).not.toBeCalled()
  expect(mockPull).not.toBeCalled()
  expect(persistenceInitialized).toBeFalsy()
  await syncManager.sync('test')

  expect(mockPull).toBeCalled()
  expect(mockPersistenceAdapter.load).toHaveBeenCalledBefore(mockPull)
  expect(persistenceInitialized).toBeTruthy()
})

it('should start sync after collection is ready', async () => {
  const persistenceAdapter = memoryPersistenceAdapter([], undefined, 100)
  const mockPersistenceAdapter = createPersistenceAdapter({
    register: vi.fn(persistenceAdapter.register),
    load: vi.fn(persistenceAdapter.load),
    save: vi.fn(persistenceAdapter.save),
  })
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
  })

  const collection = new Collection<TestItem, string, any>({
    persistence: mockPersistenceAdapter,
  })
  let persistenceInitialized = false
  void new Promise<void>((resolve) => {
    collection.once('persistence.init', resolve)
  }).then(() => {
    persistenceInitialized = true
  })

  syncManager.addCollection(collection, { name: 'test' })

  expect(mockPull).not.toBeCalled()
  expect(mockPersistenceAdapter.load).not.toBeCalled()
  expect(persistenceInitialized).toBeFalsy()
  await syncManager.sync('test')

  expect(mockPull).toBeCalled()
  expect(mockPersistenceAdapter.load).toHaveBeenCalledBefore(mockPull)
  expect(persistenceInitialized).toBeTruthy()
})

it('should fail if there was a persistence error during initialization', async () => {
  const persistenceAdapter = memoryPersistenceAdapter([], undefined, 100)
  const mockPersistenceAdapter = createPersistenceAdapter({
    register: vi.fn(persistenceAdapter.register),
    load: vi.fn(() => Promise.reject(new Error('Persistence error'))),
    save: vi.fn(persistenceAdapter.save),
  })
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
  })

  const collection = new Collection<TestItem, string, any>({
    persistence: mockPersistenceAdapter,
  })
  let persistenceInitialized = false
  void new Promise<void>((resolve) => {
    collection.once('persistence.init', resolve)
  }).then(() => {
    persistenceInitialized = true
  })
  let persistenceError = false
  void new Promise<void>((resolve) => {
    collection.once('persistence.error', () => resolve())
  }).then(() => {
    persistenceError = true
  })

  syncManager.addCollection(collection, { name: 'test' })

  expect(mockPull).not.toBeCalled()
  expect(persistenceInitialized).toBeFalsy()
  expect(persistenceError).toBeFalsy()

  await expect(syncManager.sync('test')).rejects.toThrowError('Persistence error')

  expect(mockPull).not.toBeCalled()
  expect(persistenceInitialized).toBeFalsy()
  expect(persistenceError).toBeTruthy()
})

it('should start sync if autostart is enabled', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const registerRemoteChange = vi.fn()
  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
    registerRemoteChange,
    autostart: true,
  })

  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })

  expect(registerRemoteChange).toBeCalledTimes(1)
  await syncManager.sync('test')
  expect(mockPull).toBeCalled()

  await syncManager.startSync('test')
  expect(registerRemoteChange).toBeCalledTimes(1) // already started, should not be called again
})

it('should not start sync if autostart is disabled', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const registerRemoteChange = vi.fn()
  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
    registerRemoteChange,
    autostart: false,
  })

  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })

  expect(registerRemoteChange).toBeCalledTimes(0)
  await syncManager.sync('test')
  expect(mockPull).toBeCalled()
  expect(registerRemoteChange).toBeCalledTimes(0)

  await syncManager.startSync('test')
  expect(registerRemoteChange).toBeCalledTimes(1)
})

it('should not trigger sync if collection is paused', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  type SyncManagerOptions = ConstructorParameters<typeof SyncManager>[0]
  type RegisterRemoteChangeParameters = Parameters<NonNullable<SyncManagerOptions['registerRemoteChange']>>
  type CollectionOptions = RegisterRemoteChangeParameters[0]
  type RemoteChangeHandler = RegisterRemoteChangeParameters[1]

  let onRemoteChangeHandler: RemoteChangeHandler | undefined
  const cleanupFunction = vi.fn()
  const registerRemoteChange = vi.fn((
    options: CollectionOptions,
    onRemoteChange: RemoteChangeHandler,
  ) => {
    onRemoteChangeHandler = onRemoteChange
    return cleanupFunction
  })
  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
    registerRemoteChange,
    autostart: false,
  })

  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })

  expect(registerRemoteChange).toBeCalledTimes(0)
  expect(mockPull).toBeCalledTimes(0)
  expect(onRemoteChangeHandler).toBeUndefined()

  await syncManager.startSync('test')
  if (!onRemoteChangeHandler) return
  expect(cleanupFunction).toBeCalledTimes(0)
  expect(mockPull).toBeCalledTimes(0)
  expect(registerRemoteChange).toBeCalledTimes(1)
  expect(onRemoteChangeHandler).toBeDefined()

  await onRemoteChangeHandler()
  expect(mockPull).toBeCalledTimes(1)

  await syncManager.pauseSync('test')
  await onRemoteChangeHandler()
  expect(cleanupFunction).toBeCalledTimes(1)
  expect(mockPull).toBeCalledTimes(2)
})

it('should only automatically push if started', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })

  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()

  const syncManager = new SyncManager({
    onError,
    pull: mockPull,
    push: mockPush,
    autostart: false,
  })

  const mockCollection = new Collection<TestItem, string, any>()

  syncManager.addCollection(mockCollection, { name: 'test' })
  await mockCollection.insert({ id: '2', name: 'New Item' })

  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledTimes(0)

  await syncManager.startSync('test')
  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })
  expect(onError).not.toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it('should handle an error during registerRemoteChange', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()
  const onError = vi.fn()
  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
    autostart: true,
    registerRemoteChange: () => new Promise((resolve, reject) => {
      reject(new Error('Failed to register remote change'))
    }),
    onError,
  })

  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
  expect(onError).toHaveBeenCalledTimes(1)
})

it('should return a tuple from getCollection function', () => {
  const syncManager = new SyncManager({
    pull: vi.fn(),
    push: vi.fn(),
  })
  const collection = new Collection<TestItem, string, any>()
  syncManager.addCollection(collection, { name: 'test' })
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const [collectionInstance, collectionOptions] = syncManager.getCollection('test')
  expect(collectionInstance).toBeInstanceOf(Collection)
  expect(collectionOptions).toEqual({ name: 'test' })
})

it('should pause and resume sync all collections', async () => {
  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>().mockResolvedValue({
    items: [{ id: '1', name: 'Test Item' }],
  })
  const mockPush = vi.fn<(options: any, pushParameters: any) => Promise<void>>()
    .mockResolvedValue()

  const registerRemoteChange = vi.fn()
  const syncManager = new SyncManager({
    pull: mockPull,
    push: mockPush,
    registerRemoteChange,
    autostart: false,
  })

  const col1 = new Collection<TestItem, string, any>()
  syncManager.addCollection(col1, { name: 'test1' })

  const col2 = new Collection<TestItem, string, any>()
  syncManager.addCollection(col2, { name: 'test2' })

  expect(registerRemoteChange).toBeCalledTimes(0)
  await syncManager.startAll()
  expect(registerRemoteChange).toHaveBeenNthCalledWith(1, { name: 'test1' }, expect.any(Function))
  expect(registerRemoteChange).toHaveBeenNthCalledWith(2, { name: 'test2' }, expect.any(Function))

  await syncManager.pauseAll()
  expect(registerRemoteChange).toBeCalledTimes(2)
})

it('should trigger sync when using $set on an array to modify an object/item inline', async () => {
  type ItemType = {
    id: string,
    title: string,
    text: string,
    meta?: { likes: number },
  }
  const fakeDatabasePosts: ItemType[] = []

  const posts = new Collection({ name: 'posts' })
  const pull = vi.fn<() => Promise<LoadResponse<any>>>().mockImplementation(async () => ({
    items: fakeDatabasePosts,
  }))
  const push = vi.fn<(options: any, pushParameters: any) => Promise<void>>().mockImplementation(
    async (_, { changes }) => {
      changes.added.forEach((item: ItemType) => {
        fakeDatabasePosts.push(item)
      })
    },
  )

  const syncManager = new SyncManager({
    pull,
    push,
    autostart: true,
  })

  syncManager.addCollection(posts, { name: 'posts' })

  const postId1 = posts.insert({
    title: 'Foo',
    text: 'Lorem ipsum …',
    meta: { likes: 14 },
  })
  const postId2 = posts.insert({ title: 'Foo', text: 'Riker ipsum …' })

  expect(posts.find().fetch()).toEqual([
    { id: postId1, title: 'Foo', text: 'Lorem ipsum …', meta: { likes: 14 } },
    { id: postId2, title: 'Foo', text: 'Riker ipsum …' },
  ])

  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

  expect(pull).toHaveBeenCalledTimes(2)
  expect(push).toHaveBeenCalledTimes(1)

  await posts.updateOne({ id: postId1 }, { $set: { 'meta.likes': 5 } })

  await new Promise((resolve) => {
    setTimeout(resolve, 110)
  })

  expect(push).toHaveBeenCalledTimes(2)
})
