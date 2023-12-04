import fs from 'fs'
import { describe, it, expect } from 'vitest'
import { PersistentCollection } from '../src'
import waitForEvent from './helpers/waitForEvent'

describe('PersistentCollection', () => {
  it('should create a persistent collection on the serverside', async () => {
    await fs.promises.unlink('./persistent-collection-test.json').catch(() => {})
    const collection = new PersistentCollection('test')
    await waitForEvent(collection, 'persistence.init')
    collection.insert({ id: '1', name: 'John' })
    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    const item = collection.findOne({ name: 'John' })
    expect(item).toEqual({ id: '1', name: 'John' })

    expect(fs.existsSync('./persistent-collection-test.json')).toBe(true)
  }, { retry: 5 })
})
