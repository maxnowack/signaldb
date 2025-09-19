// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import createLocalStorageAdapter from '../src'

/**
 * Generates a random collection name to avoid collisions across tests.
 * @returns A unique collection name string.
 */
function collName() {
  return `coll-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Sets up a LocalStorage adapter with optional pre-flight index mutations, mirroring the IndexedDB tests.
 * Per the unified adapter API, index mutations can be enqueued before setup.
 * @param options - Configuration options for the adapter setup.
 * @param options.collectionName - The name of the collection (default: randomly generated).
 * @param options.preIndex - Array of index names to create before setup.
 * @param options.preDrop - Array of index names to drop before setup.
 * @returns An object containing the initialized adapter and the collection name.
 */
async function withAdapter(
  options?: {
    collectionName?: string,
    preIndex?: string[],
    preDrop?: string[],
  },
) {
  const name = options?.collectionName ?? collName()

  const adapter = createLocalStorageAdapter<any, number>(name)

  // Enqueue index mutations BEFORE setup per new API (idempotent operations)
  for (const f of options?.preIndex ?? []) {
    await adapter.createIndex(f)
  }
  for (const f of options?.preDrop ?? []) {
    await adapter.dropIndex(f)
  }

  await adapter.setup()
  return { adapter, name }
}

describe('LocalStorage storage adapter', () => {
  describe('setup/teardown', () => {
    it('opens and closes with a custom collection name', async () => {
      const { adapter } = await withAdapter({ collectionName: collName() })
      await adapter.teardown()
      expect(true).toBe(true)
    })
  })

  describe('CRUD + indexing (parity with IndexedDB tests)', () => {
    let adapter: ReturnType<typeof createLocalStorageAdapter<any, number>>

    beforeEach(async () => {
      const setup = await withAdapter()
      adapter = setup.adapter
    })

    it('readAll returns [] initially', async () => {
      const items = await adapter.readAll()
      expect(items).toEqual([])
      await adapter.teardown()
    })

    it('insert writes items and readAll returns raw data only', async () => {
      await adapter.insert([{ id: 1, name: 'John' }])
      const items = await adapter.readAll()
      expect(items).toEqual([{ id: 1, name: 'John' }])
      await adapter.teardown()
    })

    it('replace is a no-op when id not found; remove is a no-op when id not found', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['name'] })
      await a.insert([{ id: 1, name: 'John' }])

      await a.replace([{ id: 999, name: 'Ghost' }]) // id not present
      await a.remove([{ id: 999 }]) // id not present

      const items = await a.readAll()
      expect(items).toEqual([{ id: 1, name: 'John' }])
      await a.teardown()
    })

    it('removeAll clears the store', async () => {
      await adapter.insert([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ])
      await adapter.removeAll()
      const items = await adapter.readAll()
      expect(items).toEqual([])
      await adapter.teardown()
    })

    it('readIds accepts an array of ids and returns [] when nothing was found', async () => {
      const result = await adapter.readIds([123_456_789])
      expect(result).toEqual([])
      await adapter.teardown()
    })

    it('readIds returns specific items by id', async () => {
      await adapter.insert([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 3, name: 'Bob' },
      ])
      const result = await adapter.readIds([1, 3])
      expect(result).toEqual([
        { id: 1, name: 'John' },
        { id: 3, name: 'Bob' },
      ])
      await adapter.teardown()
    })
  })

  describe('indexing', () => {
    it('creates and uses indices for field queries', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['name'] })
      await a.insert([
        { id: 1, name: 'John', age: 25 },
        { id: 2, name: 'Jane', age: 30 },
        { id: 3, name: 'John', age: 35 },
      ])

      const index = await a.readIndex('name')
      expect(index.get('John')).toEqual(new Set([1, 3]))
      expect(index.get('Jane')).toEqual(new Set([2]))
      await a.teardown()
    })

    it('updates indices when items are replaced', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['name'] })
      await a.insert([{ id: 1, name: 'John', age: 25 }])
      await a.replace([{ id: 1, name: 'Jane', age: 30 }])

      const index = await a.readIndex('name')
      expect(index.get('John')).toBeUndefined()
      expect(index.get('Jane')).toEqual(new Set([1]))
      await a.teardown()
    })

    it('updates indices when items are removed', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['name'] })
      await a.insert([
        { id: 1, name: 'John', age: 25 },
        { id: 2, name: 'Jane', age: 30 },
      ])
      await a.remove([{ id: 1 }])

      const index = await a.readIndex('name')
      expect(index.get('John')).toBeUndefined()
      expect(index.get('Jane')).toEqual(new Set([2]))
      await a.teardown()
    })

    it('handles index creation on existing data', async () => {
      const { adapter: a } = await withAdapter()
      await a.insert([
        { id: 1, name: 'John', age: 25 },
        { id: 2, name: 'Jane', age: 30 },
      ])
      await a.createIndex('name')

      const index = await a.readIndex('name')
      expect(index.get('John')).toEqual(new Set([1]))
      expect(index.get('Jane')).toEqual(new Set([2]))
      await a.teardown()
    })

    it('drops indices correctly', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['name'] })
      await a.insert([{ id: 1, name: 'John', age: 25 }])

      await a.dropIndex('name')

      await expect(a.readIndex('name')).rejects.toThrow('Index on field "name" does not exist')
      await a.teardown()
    })

    it('throws error when dropping non-existent index', async () => {
      const { adapter: a } = await withAdapter()
      await expect(a.dropIndex('nonexistent')).rejects.toThrow('Index on field "nonexistent" does not exist')
      await a.teardown()
    })

    it('handles corrupted index data gracefully', async () => {
      const { adapter: a, name } = await withAdapter({ preIndex: ['name'] })
      await a.insert([{ id: 1, name: 'John' }])

      // Corrupt the index by writing invalid JSON
      localStorage.setItem(`signaldb-${name}-index-name`, 'invalid-json')

      await expect(a.readIndex('name')).rejects.toThrow('Corrupted index on field "name"')
      await a.teardown()
    })

    it('handles null and undefined field values in indices', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['optional'] })
      await a.insert([
        { id: 1, name: 'John', optional: null },
        { id: 2, name: 'Jane', optional: undefined },
        { id: 3, name: 'Bob', optional: 'value' },
      ])

      const index = await a.readIndex('optional')
      expect(index.get('value')).toEqual(new Set([3]))
      expect(index.has('null')).toBe(false)
      expect(index.has('undefined')).toBe(false)
      await a.teardown()
    })

    it('removeAll clears all indices', async () => {
      const { adapter: a } = await withAdapter({ preIndex: ['name', 'age'] })
      await a.insert([
        { id: 1, name: 'John', age: 25 },
        { id: 2, name: 'Jane', age: 30 },
      ])

      await a.removeAll()

      await expect(a.readIndex('name')).rejects.toThrow('Index on field "name" does not exist')
      await expect(a.readIndex('age')).rejects.toThrow('Index on field "age" does not exist')
      await a.teardown()
    })
  })

  describe('error handling', () => {
    it('handles corrupted storage data gracefully', async () => {
      const name = collName()
      const adapter = createLocalStorageAdapter<any, number>(name)

      // Corrupt the main storage by writing invalid JSON
      localStorage.setItem(`signaldb-${name}`, 'invalid-json')

      await adapter.setup()
      const items = await adapter.readAll()
      expect(items).toEqual([]) // Should return empty array for corrupted data
      await adapter.teardown()
    })
  })

  describe('custom serialization', () => {
    it('uses custom serialize/deserialize functions', async () => {
      const customSerialize = (data: any) => `CUSTOM:${JSON.stringify(data)}`
      const customDeserialize = (string_: string) => JSON.parse(string_.replace('CUSTOM:', ''))

      const adapter = createLocalStorageAdapter<any, number>(collName(), {
        serialize: customSerialize,
        deserialize: customDeserialize,
      })

      await adapter.setup()
      await adapter.insert([{ id: 1, name: 'John' }])

      const items = await adapter.readAll()
      expect(items).toEqual([{ id: 1, name: 'John' }])
      await adapter.teardown()
    })

    it('uses custom database name', async () => {
      const name = collName()
      const adapter = createLocalStorageAdapter<any, number>(name, {
        databaseName: 'custom-db',
      })

      await adapter.setup()
      await adapter.insert([{ id: 1, name: 'John' }])

      // Check that data is stored with custom database name
      const storageKey = `custom-db-${name}`
      const stored = localStorage.getItem(storageKey)
      expect(stored).toBeTruthy()
      expect(JSON.parse(stored as string)).toEqual([{ id: 1, name: 'John' }])
      await adapter.teardown()
    })

    it('handles corrupted index during loadIndexMap', async () => {
      const { adapter: a, name } = await withAdapter({ preIndex: ['name'] })
      await a.insert([{ id: 1, name: 'John' }])

      // Corrupt the index by writing invalid JSON
      localStorage.setItem(`signaldb-${name}-index-name`, 'invalid-json')

      // This should trigger the corrupted index error in loadIndexMap (line 99)
      await expect(a.replace([{ id: 1, name: 'Jane' }])).rejects.toThrow('Corrupted index on field "name"')
      await a.teardown()
    })

    it('handles setup with existing index keys in localStorage', async () => {
      const name = collName()

      // Pre-populate localStorage with index keys to test the setup logic (lines 234-241)
      localStorage.setItem(`signaldb-${name}-index-category`, JSON.stringify({ A: [1], B: [2] }))
      localStorage.setItem(`signaldb-${name}-index-status`, JSON.stringify({ active: [1, 2] }))

      const adapter = createLocalStorageAdapter<any, number>(name)
      await adapter.setup()

      // Verify that indices array was populated from existing keys
      await adapter.insert([{ id: 1, name: 'John', category: 'A', status: 'active' }])

      // These should work because the indices were loaded during setup
      const categoryIndex = await adapter.readIndex('category')
      const statusIndex = await adapter.readIndex('status')

      expect(categoryIndex.get('A')).toContain(1)
      expect(statusIndex.get('active')).toContain(1)
      await adapter.teardown()
    })

    it('handles localStorage operations edge cases', async () => {
      const { adapter: a, name } = await withAdapter()

      // Test index handling when no index exists in localStorage (line 105 path)
      const key = `signaldb-${name}-index-missing`
      expect(localStorage.getItem(key)).toBeNull()

      await a.insert([{ id: 1, name: 'John' }])
      const items = await a.readAll()
      expect(items).toEqual([{ id: 1, name: 'John' }])
      await a.teardown()
    })
  })
})
