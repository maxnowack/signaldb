// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Collection, createLocalStorageAdapter } from '../src'
import waitForEvent from './helpers/waitForEvent'

describe('Persistence', () => {
  it('should load items from localStorage persistence adapter', async () => {
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should save items to localStorage persistence adapter', async () => {
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    expect((await persistence.load()).items).toEqual([{ id: '2', name: 'Jane' }])
  })

  it('should update item in localStorage persistence adapter', async () => {
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    expect((await persistence.load()).items).toEqual([{ id: '1', name: 'Johnny' }])
  })

  it('should not modify original items in localStorage persistence adapter', async () => {
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    const originalItems = [{ id: '1', name: 'John' }]
    await persistence.save([], { added: originalItems, removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    expect(originalItems).toEqual([{ id: '1', name: 'John' }])
  })

  it('should handle multiple operations in order', async () => {
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
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

  it('should persist data that was modified before persistence.init on client side', async () => {
    const persistence = createLocalStorageAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    collection.insert({ id: '1', name: 'John' })
    collection.insert({ id: '2', name: 'Jane' })
    collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    collection.removeOne({ id: '2' })
    await waitForEvent(collection, 'persistence.init')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    expect((await persistence.load()).items).toEqual([{ id: '1', name: 'Johnny' }])
  }, { retry: 5 })
})
