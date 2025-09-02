import { describe, it, expect } from 'vitest'
import createStorageAdapter from './createStorageAdapter'
import type StorageAdapter from './types/StorageAdapter'

interface TestItem {
  id: string,
  name: string,
}

describe('createStorageAdapter', () => {
  it('should return the provided storage adapter definition', () => {
    const definition: StorageAdapter<TestItem, string> = {
      setup: () => Promise.resolve(),
      teardown: () => Promise.resolve(),
      readAll: () => Promise.resolve([]),
      readIds: () => Promise.resolve([]),
      createIndex: () => Promise.resolve(),
      dropIndex: () => Promise.resolve(),
      readIndex: () => Promise.resolve(new Map()),
      insert: () => Promise.resolve(),
      replace: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      removeAll: () => Promise.resolve(),
    }

    const result = createStorageAdapter(definition)

    expect(result).toBe(definition)
  })

  it('should preserve all methods and properties', async () => {
    const testData = [{ id: '1', name: 'test' }]

    const definition: StorageAdapter<TestItem, string> = {
      setup: () => Promise.resolve(),
      teardown: () => Promise.resolve(),
      readAll: () => Promise.resolve(testData),
      readIds: ids => Promise.resolve(testData.filter(item => ids.includes(item.id))),
      createIndex: () => Promise.resolve(),
      dropIndex: () => Promise.resolve(),
      readIndex: () => Promise.resolve(new Map()),
      insert: () => Promise.resolve(),
      replace: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      removeAll: () => Promise.resolve(),
    }

    const adapter = createStorageAdapter(definition)

    // Test that methods work as expected
    await expect(adapter.setup()).resolves.toBeUndefined()
    await expect(adapter.teardown()).resolves.toBeUndefined()
    await expect(adapter.readAll()).resolves.toEqual(testData)
    await expect(adapter.readIds(['1'])).resolves.toEqual(testData)
    await expect(adapter.createIndex('name')).resolves.toBeUndefined()
    await expect(adapter.dropIndex('name')).resolves.toBeUndefined()
    await expect(adapter.readIndex('name')).resolves.toBeInstanceOf(Map)
    await expect(adapter.insert(testData)).resolves.toBeUndefined()
    await expect(adapter.replace(testData)).resolves.toBeUndefined()
    await expect(adapter.remove(testData)).resolves.toBeUndefined()
    await expect(adapter.removeAll()).resolves.toBeUndefined()
  })
})
