// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { PersistentCollection } from 'signaldb'
import waitForEvent from './helpers/waitForEvent'

describe('PersistentCollection', () => {
  it('should create a persistent collection on the clientside', async () => {
    const collection = new PersistentCollection('test')
    await waitForEvent(collection, 'persistence.init')
    collection.insert({ id: '1', name: 'John' })
    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    const item = collection.findOne({ name: 'John' })
    expect(item).toEqual({ id: '1', name: 'John' })

    expect(!!localStorage.getItem('signaldb-collection-test')).toBe(true)
  })
})
