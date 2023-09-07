import fs from 'fs'
import { describe, it, expect, afterAll } from 'vitest'
import { PersistentCollection } from '../src/index'
import waitForEvent from '../src/utils/waitForEvent'

describe('PersistentCollection', () => {
  it('should create a persistent collection on the serverside', async () => {
    const collection = new PersistentCollection('test')
    await waitForEvent(collection, 'persistence.init')
    collection.insert({ id: '1', name: 'John' })
    collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    const item = collection.findOne({ name: 'John' })
    expect(item).toEqual({ id: '1', name: 'John' })

    expect(fs.existsSync('./persistent-collection-test.json')).toBe(true)
  })

  afterAll(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 100) })
    await fs.promises.unlink('./persistent-collection-test.json').catch(() => {})
  })
})
