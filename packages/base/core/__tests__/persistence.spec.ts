import { describe, it, expect, vi } from 'vitest'
import { Collection } from '../src'
import waitForEvent from './helpers/waitForEvent'
import memoryPersistenceAdapter from './helpers/memoryPersistenceAdapter'

describe('Persistence', () => {
  it('should load items from persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }])
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should save items to persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter()
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    await collection.insert({ id: '1', name: 'John' })
    await waitForEvent(collection, 'persistence.transmitted')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should get items from persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }])
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])

    persistence.addNewItem({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.received')

    const newItems = collection.find().fetch()
    expect(newItems).toEqual([
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
    ])
  })

  it('should get changes from persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }], true)
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])

    persistence.addNewItem({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.received')
    expect(collection.find().fetch()).toEqual([
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
    ])

    persistence.changeItem({ id: '1', name: 'Johnny' })
    await waitForEvent(collection, 'persistence.received')
    expect(collection.find().fetch()).toEqual([
      { id: '1', name: 'Johnny' },
      { id: '2', name: 'Jane' },
    ])

    persistence.removeItem({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.received')
    expect(collection.find().fetch()).toEqual([{ id: '1', name: 'Johnny' }])
  })

  it('should remove item from persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }])
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '2', name: 'Jane' }])
  })

  it('should update item in persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }])
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '1', name: 'Johnny' }])
  })

  it('should not modify original items in persistence adapter', async () => {
    const originalItems = [{ id: '1', name: 'John' }]
    const persistence = memoryPersistenceAdapter(originalItems)
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    expect(originalItems).toEqual([{ id: '1', name: 'John' }])
  })

  it('should handle multiple operations in order', async () => {
    const persistence = memoryPersistenceAdapter()
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.insert({ id: '1', name: 'John' })
    await waitForEvent(collection, 'persistence.transmitted')
    await collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')
    await collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '2', name: 'Jane' }])
  })

  it('should emit persistence.error if the adapter throws an error on registering', async () => {
    const collection = new Collection({
      persistence: {
        register: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('test')), 100)
        }),
        load: () => Promise.resolve({ items: [] }),
        save: () => Promise.resolve(),
      },
    })
    const fn = vi.fn()
    collection.on('persistence.error', fn)
    await expect(collection.isReady()).rejects.toThrowError('test')
    expect(fn).toHaveBeenCalledWith(new Error('test'))
  })

  it('should emit persistence.error if the adapter throws an error on load', async () => {
    const collection = new Collection({
      persistence: {
        register: () => Promise.resolve(),
        load: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('test')), 100)
        }),
        save: () => Promise.resolve(),
      },
    })
    const fn = vi.fn()
    collection.on('persistence.error', fn)
    await expect(collection.isReady()).rejects.toThrowError('test')
    expect(fn).toHaveBeenCalledWith(new Error('test'))
  })

  it('should emit persistence.error if the adapter throws an error on save', async () => {
    const collection = new Collection<{ id: string }>({
      persistence: {
        register: () => Promise.resolve(),
        load: () => Promise.resolve({ items: [] }),
        save: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('test')), 100)
        }),
      },
    })
    const fn = vi.fn()
    collection.on('persistence.error', fn)
    await waitForEvent(collection, 'persistence.init')
    await collection.insert({ id: '1' })
    await waitForEvent(collection, 'persistence.error')

    await collection.updateOne({ id: '1' }, { $set: { name: 'John' } })
    await waitForEvent(collection, 'persistence.error')

    await collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.error')

    expect(fn).toHaveBeenCalledWith(new Error('test'))
  })

  it('should emit persistence.error if the adapter rejects on registering', async () => {
    const collection = new Collection({
      persistence: {
        register: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('test')), 100)
        }),
        load: () => Promise.resolve({ items: [] }),
        save: () => Promise.resolve(),
      },
    })
    const fn = vi.fn()
    collection.on('persistence.error', fn)
    await expect(collection.isReady()).rejects.toThrowError('test')
    expect(fn).toHaveBeenCalledWith(new Error('test'))
  })

  it('should emit persistence.error if the adapter rejects on load', async () => {
    const collection = new Collection({
      persistence: {
        register: () => Promise.resolve(),
        load: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('test')), 100)
        }),
        save: () => Promise.resolve(),
      },
    })
    const fn = vi.fn()
    collection.on('persistence.error', fn)
    await expect(collection.isReady()).rejects.toThrowError('test')
    expect(fn).toHaveBeenCalledWith(new Error('test'))
  })

  it('should emit persistence.error if the adapter rejects on save', async () => {
    const collection = new Collection<{ id: string }>({
      persistence: {
        register: () => Promise.resolve(),
        load: () => Promise.resolve({ items: [] }),
        save: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('test')), 100)
        }),
      },
    })
    const fn = vi.fn()
    collection.on('persistence.error', fn)
    await waitForEvent(collection, 'persistence.init')
    await collection.insert({ id: '1' })
    await waitForEvent(collection, 'persistence.error')

    await collection.updateOne({ id: '1' }, { $set: { name: 'John' } })
    await waitForEvent(collection, 'persistence.error')

    await collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.error')

    expect(fn).toHaveBeenCalledWith(new Error('test'))
  })

  it('should emit all required events', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }])
    const collection = new Collection({ persistence })
    await Promise.all([
      waitForEvent(collection, 'persistence.pullStarted'),
      waitForEvent(collection, 'persistence.received'),
      waitForEvent(collection, 'persistence.pullCompleted'),
      waitForEvent(collection, 'persistence.init'),
    ])

    await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await Promise.all([
      waitForEvent(collection, 'persistence.pushStarted'),
      waitForEvent(collection, 'persistence.pushCompleted'),
      waitForEvent(collection, 'persistence.transmitted'),
    ])

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '1', name: 'Johnny' }])
  })

  it('should return correct values from isPulling, isPushing and isLoading', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }])
    const collection = new Collection({ persistence })

    const pullStarted = waitForEvent(collection, 'persistence.pullStarted')
    const pullCompleted = waitForEvent(collection, 'persistence.pullCompleted')
    const initialized = waitForEvent(collection, 'persistence.init')
    await pullStarted
    expect(collection.isPulling()).toBe(true)
    expect(collection.isLoading()).toBe(true)
    await pullCompleted
    expect(collection.isPulling()).toBe(false)
    expect(collection.isLoading()).toBe(false)
    await initialized

    const pushStarted = waitForEvent(collection, 'persistence.pushStarted')
    const pushCompleted = waitForEvent(collection, 'persistence.pushCompleted')
    await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await pushStarted
    expect(collection.isPushing()).toBe(true)
    expect(collection.isLoading()).toBe(true)
    await pushCompleted
    expect(collection.isPushing()).toBe(false)
    expect(collection.isLoading()).toBe(false)
  })

  it('should be able to pass load response to onChange callback', async () => {
    const onChange = vi.fn()
    const collection = new Collection({
      persistence: {
        register: async (onChangeCallback) => {
          onChange.mockImplementation(onChangeCallback)
          return
        },
        load: () => Promise.resolve({
          items: [{ id: '1', name: 'John' }],
          meta: { total: 1 },
        }),
        save: () => Promise.resolve(),
      },
    })
    await waitForEvent(collection, 'persistence.init')

    expect(onChange).toBeCalledTimes(0)
    expect(collection.find().fetch()).toEqual([{ id: '1', name: 'John' }])

    onChange({ changes: { added: [{ id: '2', name: 'Jane' }], modified: [], removed: [] } })
    expect(onChange).toBeCalledTimes(1)
    expect(collection.find().fetch()).toEqual([{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }])
  })

  it('should upsert added items from persistence adapter', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }], true)
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])

    persistence.addNewItem({ id: '1', name: 'Jane' })
    await waitForEvent(collection, 'persistence.received')
    expect(collection.find().fetch()).toEqual([
      { id: '1', name: 'Jane' },
    ])
  })

  it('should modify items when persistence adapter is async', async () => {
    const persistence = memoryPersistenceAdapter([{ id: '1', name: 'John' }, { id: 'x', name: 'Joe' }], true, 100)
    const collection = new Collection({ persistence })
    await collection.isReady()
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }, { id: 'x', name: 'Joe' }])

    await collection.insert({ id: '2', name: 'Jane' })
    await collection.updateOne({ id: '1' }, { $set: { name: 'Jack' } })
    await collection.removeOne({ id: 'x' })

    await waitForEvent(collection, 'persistence.transmitted')
    await waitForEvent(collection, 'persistence.init')
    expect(collection.find().fetch()).toEqual([
      { id: '1', name: 'Jack' },
      { id: '2', name: 'Jane' },
    ])
  })
})
