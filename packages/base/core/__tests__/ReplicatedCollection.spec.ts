import { vi, it, describe, expect } from 'vitest'
import type { ReplicatedCollectionOptions } from '../src/ReplicatedCollection'
import ReplicatedCollection, { createReplicationAdapter } from '../src/ReplicatedCollection'
import type { BaseItem } from '../src/Collection'
import Collection from '../src/Collection'
import type { Changeset, LoadResponse } from '../src/types/PersistenceAdapter'
import createPersistenceAdapter from '../src/persistence/createPersistenceAdapter'
import waitForEvent from './helpers/waitForEvent'

describe('createReplicationAdapter', () => {
  it('should call registerRemoteChange and register onChange', async () => {
    const pull = vi.fn().mockResolvedValue({} as LoadResponse<any>)
    const push = vi.fn().mockResolvedValue(undefined)
    const registerRemoteChange = vi.fn().mockResolvedValue(undefined)
    const onChange = vi.fn()

    const options = {
      pull,
      push,
      registerRemoteChange,
    }

    const adapter = createReplicationAdapter(options)
    await adapter.register(onChange)

    expect(registerRemoteChange).toHaveBeenCalledTimes(1)
    expect(registerRemoteChange).toHaveBeenCalledWith(onChange)
  })

  it('should not call registerRemoteChange if it is not provided', async () => {
    const pull = vi.fn().mockResolvedValue({} as LoadResponse<any>)
    const push = vi.fn().mockResolvedValue(undefined)
    const onChange = vi.fn()

    const options = {
      pull,
      push,
    }

    const adapter = createReplicationAdapter(options)
    await adapter.register(onChange)

    expect(onChange).toHaveBeenCalledTimes(0)
  })

  it('should call pull when load is called', async () => {
    const pull = vi.fn().mockResolvedValue({} as LoadResponse<any>)
    const push = vi.fn().mockResolvedValue(undefined)

    const options = {
      pull,
      push,
    }

    const adapter = createReplicationAdapter(options)
    await adapter.load()

    expect(pull).toHaveBeenCalledTimes(1)
  })

  it('should call push when save is called', async () => {
    const pull = vi.fn().mockResolvedValue({} as LoadResponse<any>)
    const push = vi.fn().mockResolvedValue(undefined)
    const items = [{ id: 1, name: 'Item 1' }]
    const changes: Changeset<any> = { added: [], modified: [], removed: [] }

    const options = {
      pull,
      push,
    }

    const adapter = createReplicationAdapter(options)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await adapter.save(items, changes)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(changes, items)
  })
})

describe('ReplicatedCollection', () => {
  it('should create a ReplicatedCollection instance', () => {
    const options: ReplicatedCollectionOptions<BaseItem<number>, number> = {
      pull: vi.fn().mockResolvedValue({} as LoadResponse<BaseItem<number>>),
      push: vi.fn().mockResolvedValue(undefined),
    }

    const collection = new ReplicatedCollection(options)

    expect(collection).toBeInstanceOf(ReplicatedCollection)
    expect(collection).toBeInstanceOf(Collection)
  })

  it('should combine persistence and replication adapters', async () => {
    const pull = vi.fn().mockResolvedValue({ items: [] } as LoadResponse<any>)
    const push = vi.fn().mockResolvedValue(undefined)
    const registerRemoteChange = vi.fn().mockResolvedValue(undefined)

    const persistenceAdapter = createPersistenceAdapter({
      register: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue({ items: [] } as LoadResponse<any>),
      save: vi.fn().mockResolvedValue(undefined),
    })

    const collection = new ReplicatedCollection({
      pull,
      push,
      registerRemoteChange,
      persistence: persistenceAdapter,
    })
    expect(collection).toBeInstanceOf(ReplicatedCollection)
    await waitForEvent(collection, 'persistence.init')
    expect(persistenceAdapter.register).toHaveBeenCalledTimes(1)
    expect(persistenceAdapter.load).toHaveBeenCalledTimes(1)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(persistenceAdapter.save).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(0)
    expect(registerRemoteChange).toHaveBeenCalledTimes(1)
  })

  it('should output the correct isLoading state', async () => {
    const pull = vi.fn().mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ items: [{ id: '1', name: 'Item 1' }] } as LoadResponse<any>), 10)
    }))
    const push = vi.fn().mockResolvedValue(() => new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 10)
    }))
    const registerRemoteChange = vi.fn().mockResolvedValue(undefined)

    const persistenceAdapter = createPersistenceAdapter({
      register: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue({ items: [] } as LoadResponse<any>),
      save: vi.fn().mockResolvedValue(undefined),
    })

    const collection = new ReplicatedCollection({
      pull,
      push,
      registerRemoteChange,
      persistence: persistenceAdapter,
    })
    expect(collection.isLoading()).toBe(true)
    expect(collection.find().fetch()).toEqual([])
    await waitForEvent(collection, 'persistence.init')

    expect(collection.isLoading()).toBe(true)
    expect(collection.find().fetch()).toEqual([])

    expect(pull).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(0)

    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
    expect(collection.find().fetch()).toEqual([{ id: '1', name: 'Item 1' }])
    expect(collection.isLoading()).toBe(false)

    await collection.insert({ id: '2', name: 'Item 2' })
    expect(collection.isLoading()).toBe(true)

    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
    expect(collection.isLoading()).toBe(false)
  })
})
