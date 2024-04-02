import { vi, it, describe, expect, beforeAll } from 'vitest'
import type { ReplicatedCollectionOptions } from '../src/ReplicatedCollection'
import ReplicatedCollection, { createReplicationAdapter } from '../src/ReplicatedCollection'
import type { BaseItem } from '../src/Collection'
import Collection from '../src/Collection'
import type { Changeset, LoadResponse } from '../src/types/PersistenceAdapter'
import createPersistenceAdapter from '../src/persistence/createPersistenceAdapter'
import waitForEvent from './helpers/waitForEvent'

describe('createReplicationAdapter', () => {
  it('should call handleRemoteChange and register onChange', async () => {
    const pull = vi.fn().mockResolvedValue({} as LoadResponse<any>)
    const push = vi.fn().mockResolvedValue(undefined)
    const handleRemoteChange = vi.fn().mockResolvedValue(undefined)
    const onChange = vi.fn()

    const options = {
      pull,
      push,
      handleRemoteChange,
    }

    const adapter = createReplicationAdapter(options)
    await adapter.register(onChange)

    expect(handleRemoteChange).toHaveBeenCalledTimes(1)
    expect(handleRemoteChange).toHaveBeenCalledWith(onChange)
  })

  it('should not call handleRemoteChange if it is not provided', async () => {
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
  beforeAll(() => {
    vi.useFakeTimers()
  })

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
    const handleRemoteChange = vi.fn().mockResolvedValue(undefined)

    const persistenceAdapter = createPersistenceAdapter({
      register: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue({ items: [] } as LoadResponse<any>),
      save: vi.fn().mockResolvedValue(undefined),
    })

    const collection = new ReplicatedCollection({
      pull,
      push,
      handleRemoteChange,
      persistence: persistenceAdapter,
    })
    expect(collection).toBeInstanceOf(ReplicatedCollection)
    await waitForEvent(collection, 'persistence.init')
    expect(persistenceAdapter.register).toHaveBeenCalledTimes(1)
    expect(persistenceAdapter.load).toHaveBeenCalledTimes(1)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(persistenceAdapter.save).toHaveBeenCalledTimes(0)
    expect(push).toHaveBeenCalledTimes(0)
    expect(handleRemoteChange).toHaveBeenCalledTimes(1)
  })
})
