// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { PersistentCollection } from '../src'
import waitForEvent from './helpers/waitForEvent'

describe('PersistentCollection (client side)', () => {
  it('should create a persistent collection on the client side', async () => {
    const collectionName = `test-${Math.floor(Math.random() * 1e17).toString(16)}`
    const collection = new PersistentCollection(collectionName)
    await waitForEvent(collection, 'persistence.init')
    collection.insert({ id: '1', name: 'John' })
    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    const item = collection.findOne({ name: 'John' })
    expect(item).toEqual({ id: '1', name: 'John' })

    expect(!!localStorage.getItem(`signaldb-collection-${collectionName}`)).toBe(true)
  })

  it('should persist data that was added before persistence.init on client side', async () => {
    const collectionName = `test-${Math.floor(Math.random() * 1e17).toString(16)}`
    const collection = new PersistentCollection(collectionName)
    collection.insert({ id: '1', name: 'John' })
    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.init')

    const item = collection.findOne({ name: 'John' })
    expect(item).toEqual({ id: '1', name: 'John' })

    expect(!!localStorage.getItem(`signaldb-collection-${collectionName}`)).toBe(true)
  }, { retry: 5 })
})
