// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Collection, createLocalStorageAdapter } from '../src'
import waitForEvent from './helpers/waitForEvent'

const persistence = createLocalStorageAdapter('test')

describe('Persistence', () => {
  it('should load items from localStorage persistence adapter', async () => {
    await persistence.save([{ id: '1', name: 'John' }], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should save items to localStorage persistence adapter', async () => {
    await persistence.save([], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    collection.insert({ id: '1', name: 'John' })
    await waitForEvent(collection, 'persistence.transmitted')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
    expect((await persistence.load()).items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should remove item from localStorage persistence adapter', async () => {
    await persistence.save([{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    expect((await persistence.load()).items).toEqual([{ id: '2', name: 'Jane' }])
  })

  it('should update item in localStorage persistence adapter', async () => {
    await persistence.save([{ id: '1', name: 'John' }], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    expect((await persistence.load()).items).toEqual([{ id: '1', name: 'Johnny' }])
  })

  it('should not modify original items in localStorage persistence adapter', async () => {
    const originalItems = [{ id: '1', name: 'John' }]
    await persistence.save(originalItems, { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    expect(originalItems).toEqual([{ id: '1', name: 'John' }])
  })

  it('should handle multiple operations in order', async () => {
    await persistence.save([], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.insert({ id: '1', name: 'John' })
    await waitForEvent(collection, 'persistence.transmitted')
    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')
    collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    expect((await persistence.load()).items).toEqual([{ id: '2', name: 'Jane' }])
  })
})
