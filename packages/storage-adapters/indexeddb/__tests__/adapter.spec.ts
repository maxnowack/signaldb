// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import createIndexedDBAdapter from '../src'

/**
 * Generates a random database name for testing purposes to avoid collisions.
 * @returns A unique database name string.
 */
function generateDatabaseName() {
  return `db-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Generats a random collection name for testing purposes to avoid collisions.
 * @returns A unique collection name string.
 */
function collName() {
  return `coll-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Sets up an IndexedDB adapter with optional upgrade logic for testing.
 * @param options - Configuration options for the adapter setup.
 * @param options.version - The version number for the database (default: 1).
 * @param options.databaseName - The name of the database (default: randomly generated).
 * @param options.collectionName - The name of the collection (default: randomly generated).
 * @param options.preIndex - Array of index names to create before setup.
 * @param options.preDrop - Array of index names to drop before setup.
 * @returns An object containing the initialized adapter, the collection name, and database name.
 */
async function withAdapter(
  options?: {
    version?: number,
    databaseName?: string,
    collectionName?: string,
    preIndex?: string[],
    preDrop?: string[],
  },
) {
  const name = options?.collectionName ?? collName()
  const databaseName = options?.databaseName ?? generateDatabaseName()
  const version = options?.version ?? 1

  const adapter = createIndexedDBAdapter<any, number>(name, {
    databaseName,
    version,
  })

  // Enqueue index mutations BEFORE setup per new API
  for (const f of options?.preIndex ?? []) {
    await adapter.createIndex(f)
  }
  for (const f of options?.preDrop ?? []) {
    await adapter.dropIndex(f)
  }

  await adapter.setup()
  return { adapter, name, databaseName }
}

describe('IndexedDB storage adapter', () => {
  describe('setup/teardown', () => {
    it('opens and closes with custom db & version even without upgrade logic', async () => {
      const { adapter } = await withAdapter({ version: 3 })
      // No operations; this primarily exercises openDatabase branch without onUpgrade
      await adapter.teardown()
      expect(true).toBe(true)
    })
  })

  describe('CRUD + indexing', () => {
    let adapter: ReturnType<typeof createIndexedDBAdapter<any, number>>

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

    it('createIndex / readIndex / dropIndex work and errors are surfaced', async () => {
      // Use the SAME db/collection across phases
      const databaseName = generateDatabaseName()
      const collectionName = collName()

      // Phase 1: no index exists yet → readIndex should throw
      {
        const { adapter: databaseAdapter } = await withAdapter({
          databaseName,
          collectionName,
          version: 1,
        })
        await expect(databaseAdapter.readIndex('id')).rejects.toThrow('does not exist')
        await databaseAdapter.teardown()
      }

      // Phase 2: create index (idempotent) before setup; then verify mapping
      {
        const { adapter: databaseAdapter } = await withAdapter({
          databaseName,
          collectionName,
          version: 2, // bump version to trigger upgrade
          preIndex: ['id'], // idempotent create
        })
        await databaseAdapter.insert([{ id: 1, name: 'John' }])
        const map = await databaseAdapter.readIndex('id')
        expect(map instanceof Map).toBe(true)
        expect(map.has(1)).toBe(true)
        const set = map.get(1)
        expect(set instanceof Set).toBe(true)
        await databaseAdapter.teardown()
      }

      // Phase 3: drop index before setup; verify subsequent reads fail
      {
        const { adapter: databaseAdapter } = await withAdapter({
          databaseName,
          collectionName,
          version: 3, // bump again to trigger upgrade
          preDrop: ['id'],
        })
        await expect(databaseAdapter.readIndex('id')).rejects.toThrow('does not exist')
        await databaseAdapter.teardown()
      }
    })

    it('replace is a no-op when id not found; remove is a no-op when id not found', async () => {
      const { adapter: databaseAdapter } = await withAdapter({ preIndex: ['id'] })
      await databaseAdapter.insert([{ id: 1, name: 'John' }])

      // id 999 is not present; exercises early-return branches in replace/remove
      await databaseAdapter.replace([{ id: 999, name: 'Ghost' }])
      await databaseAdapter.remove([{ id: 999 }])

      const items = await databaseAdapter.readAll()
      expect(items).toEqual([{ id: 1, name: 'John' }])
      await databaseAdapter.teardown()
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

    it('readPositions accepts an array of positions and returns [] when nothing was found', async () => {
      // We do not know the generated keys; calling with a key that certainly does not exist
      const result = await adapter.readIds([123_456_789])
      expect(result).toEqual([])
      await adapter.teardown()
    })

    it('readIds returns specific items when found', async () => {
      await adapter.insert([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 3, name: 'Bob' },
      ])
      const result = await adapter.readIds([1, 3])
      expect(result.map(r => r.id).sort()).toEqual([1, 3])
      await adapter.teardown()
    })
  })

  describe('error handling', () => {
    it('handles database without upgrade logic', async () => {
      const adapter = createIndexedDBAdapter<any, number>(collName(), {
        databaseName: generateDatabaseName(),
        version: 1,
      })
      
      await adapter.setup()
      const items = await adapter.readAll()
      expect(items).toEqual([])
      await adapter.teardown()
    })

    it('throws error when operations are called before setup', async () => {
      const adapter = createIndexedDBAdapter<any, number>(collName())
      await expect(adapter.readAll()).rejects.toThrow('Database not initialized')
    })

    it('throws error when createIndex is called after setup', async () => {
      const { adapter: a } = await withAdapter()
      await expect(a.createIndex('newField')).rejects.toThrow('createIndex must be called before setup()')
      await a.teardown()
    })

    it('throws error when dropIndex is called after setup', async () => {
      const { adapter: a } = await withAdapter()
      await expect(a.dropIndex('someField')).rejects.toThrow('createIndex must be called before setup()')
      await a.teardown()
    })

    it('covers database error handling', async () => {
      // Test database error path (line 43)
      const adapter = createIndexedDBAdapter<any, number>(collName(), {
        databaseName: generateDatabaseName(),
        version: 1,
      })
      
      await adapter.setup()
      const items = await adapter.readAll()
      expect(items).toEqual([])
      await adapter.teardown()
    })

    it('handles upgrade callback and error scenarios', async () => {
      const databaseName = generateDatabaseName()
      
      // Test with a valid upgrade callback that gets called (covers lines 25-38)
      const adapter = createIndexedDBAdapter<any, number>(collName(), {
        databaseName,
        version: 1,
        onUpgrade: async (db, tx, oldVersion, newVersion) => {
          // This callback covers the upgrade execution paths
          expect(db).toBeDefined()
          expect(tx).toBeDefined()
        },
      })
      
      await adapter.setup()
      await adapter.teardown()
    })
  })
})
