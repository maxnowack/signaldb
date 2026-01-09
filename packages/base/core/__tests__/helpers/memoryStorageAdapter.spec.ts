import { describe, it, expect } from 'vitest'
import memoryStorageAdapter from './memoryStorageAdapter'

interface TestItem {
  id: string,
  name: string,
  value?: number,
}

describe('memoryStorageAdapter', () => {
  it('should create empty adapter when no initial data provided', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    const items = await adapter.readAll()
    expect(items).toEqual([])
  })

  it('should create adapter with initial data', async () => {
    const initialData: TestItem[] = [
      { id: '1', name: 'test1' },
      { id: '2', name: 'test2' },
    ]

    const adapter = memoryStorageAdapter(initialData)

    const items = await adapter.readAll()
    expect(items).toHaveLength(2)
    expect(items).toContainEqual({ id: '1', name: 'test1' })
    expect(items).toContainEqual({ id: '2', name: 'test2' })
  })

  it('should handle setup and teardown', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    await expect(adapter.setup()).resolves.toBeUndefined()
    await expect(adapter.teardown()).resolves.toBeUndefined()
  })

  it('should handle readAll with delay', async () => {
    const adapter = memoryStorageAdapter<TestItem>([{ id: '1', name: 'test' }], 80)

    const startTime = Date.now()
    const items = await adapter.readAll()
    const endTime = Date.now()

    expect(items).toHaveLength(1)
    expect(endTime - startTime).toBeGreaterThanOrEqual(50)
  })

  it('should handle readAll without delay', async () => {
    const adapter = memoryStorageAdapter<TestItem>([{ id: '1', name: 'test' }])

    const startTime = Date.now()
    const items = await adapter.readAll()
    const endTime = Date.now()

    expect(items).toHaveLength(1)
    expect(endTime - startTime).toBeLessThan(50) // Should be fast
  })

  it('should handle readIds', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'test1' },
      { id: '2', name: 'test2' },
      { id: '3', name: 'test3' },
    ])

    const items = await adapter.readIds(['1', '3', 'nonexistent'])

    expect(items).toHaveLength(2)
    expect(items).toContainEqual({ id: '1', name: 'test1' })
    expect(items).toContainEqual({ id: '3', name: 'test3' })
  })

  it('should handle readIds with empty array', async () => {
    const adapter = memoryStorageAdapter<TestItem>([{ id: '1', name: 'test' }])

    const items = await adapter.readIds([])
    expect(items).toEqual([])
  })

  it('should handle createIndex', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'alice' },
      { id: '2', name: 'bob' },
      { id: '3', name: 'alice' },
    ])

    await adapter.createIndex('name')

    const index = await adapter.readIndex('name')
    expect(index).toBeInstanceOf(Map)
    expect(index.get('alice')).toEqual(new Set(['1', '3']))
    expect(index.get('bob')).toEqual(new Set(['2']))
  })

  it('should throw error when creating duplicate index', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    await adapter.createIndex('name')

    expect(() => adapter.createIndex('name')).toThrow('Index on field "name" already exists')
  })

  it('should handle dropIndex', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    await adapter.createIndex('name')
    await adapter.dropIndex('name')

    await expect(adapter.readIndex('name')).rejects.toThrow('Index on field "name" does not exist')
  })

  it('should throw error when reading nonexistent index', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    await expect(adapter.readIndex('nonexistent')).rejects.toThrow('Index on field "nonexistent" does not exist')
  })

  it('should handle insert', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    const newItems: TestItem[] = [
      { id: '1', name: 'test1' },
      { id: '2', name: 'test2' },
    ]

    await adapter.insert(newItems)

    const allItems = await adapter.readAll()
    expect(allItems).toHaveLength(2)
    expect(allItems).toContainEqual({ id: '1', name: 'test1' })
    expect(allItems).toContainEqual({ id: '2', name: 'test2' })
  })

  it('should rebuild indexes after insert', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    await adapter.createIndex('name')

    const newItems: TestItem[] = [
      { id: '1', name: 'alice' },
      { id: '2', name: 'bob' },
    ]

    await adapter.insert(newItems)

    const index = await adapter.readIndex('name')
    expect(index.get('alice')).toEqual(new Set(['1']))
    expect(index.get('bob')).toEqual(new Set(['2']))
  })

  it('should handle replace', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'original' },
    ])

    const updatedItems: TestItem[] = [
      { id: '1', name: 'updated', value: 100 },
    ]

    await adapter.replace(updatedItems)

    const allItems = await adapter.readAll()
    expect(allItems).toHaveLength(1)
    expect(allItems[0]).toEqual({ id: '1', name: 'updated', value: 100 })
  })

  it('should handle remove', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'test1' },
      { id: '2', name: 'test2' },
    ])

    await adapter.remove([{ id: '1', name: 'test1' }])

    const allItems = await adapter.readAll()
    expect(allItems).toHaveLength(1)
    expect(allItems[0]).toEqual({ id: '2', name: 'test2' })
  })

  it('should handle removeAll', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'test1' },
      { id: '2', name: 'test2' },
    ])

    await adapter.removeAll()

    const allItems = await adapter.readAll()
    expect(allItems).toEqual([])
  })

  it('should handle complex workflow with indexes', async () => {
    const adapter = memoryStorageAdapter<TestItem>()

    // Create indexes
    await adapter.createIndex('name')
    await adapter.createIndex('value')

    // Insert initial data
    await adapter.insert([
      { id: '1', name: 'alice', value: 10 },
      { id: '2', name: 'bob', value: 20 },
    ])

    // Check indexes
    let nameIndex = await adapter.readIndex('name')
    let valueIndex = await adapter.readIndex('value')
    expect(nameIndex.get('alice')).toEqual(new Set(['1']))
    expect(valueIndex.get(10)).toEqual(new Set(['1']))

    // Replace item
    await adapter.replace([{ id: '1', name: 'charlie', value: 30 }])

    // Check updated indexes
    nameIndex = await adapter.readIndex('name')
    valueIndex = await adapter.readIndex('value')
    expect(nameIndex.get('alice')).toBeUndefined()
    expect(nameIndex.get('charlie')).toEqual(new Set(['1']))
    expect(valueIndex.get(10)).toBeUndefined()
    expect(valueIndex.get(30)).toEqual(new Set(['1']))

    // Read specific IDs
    const specificItems = await adapter.readIds(['1'])
    expect(specificItems).toHaveLength(1)
    expect(specificItems[0]).toEqual({ id: '1', name: 'charlie', value: 30 })
  })

  it('should handle edge cases with undefined/null field values', async () => {
    const adapter = memoryStorageAdapter<TestItem & { optional?: string }>([
      { id: '1', name: 'test', optional: undefined },
      { id: '2', name: 'test2', optional: 'defined' },
    ])

    await adapter.createIndex('optional')

    const index = await adapter.readIndex('optional')
    expect(index.get(undefined)).toEqual(new Set(['1']))
    expect(index.get('defined')).toEqual(new Set(['2']))
  })

  it('should handle insert with existing ids (override behavior)', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'original' },
    ])

    await adapter.insert([
      { id: '1', name: 'overridden' },
      { id: '2', name: 'new' },
    ])

    const allItems = await adapter.readAll()
    expect(allItems).toHaveLength(2)
    expect(allItems.find(item => item.id === '1')).toEqual({ id: '1', name: 'overridden' })
    expect(allItems.find(item => item.id === '2')).toEqual({ id: '2', name: 'new' })
  })

  it('should reuse index buckets when rebuilding with duplicate field values', async () => {
    const adapter = memoryStorageAdapter<TestItem>([
      { id: '1', name: 'shared' },
      { id: '2', name: 'shared' },
    ])

    await adapter.createIndex('name')

    await adapter.insert([{ id: '3', name: 'shared' }])
    const index = await adapter.readIndex('name')
    expect(index.get('shared')).toEqual(new Set(['1', '2', '3']))
  })
})
