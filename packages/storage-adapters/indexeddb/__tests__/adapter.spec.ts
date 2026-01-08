// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import prepareIndexedDB from '../src'

/**
 * Generates a random database name for testing purposes to avoid collisions.
 * @returns A unique database name string.
 */
function generateDatabaseName() {
  return `db-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Generates a random collection name for testing purposes to avoid collisions.
 * @returns A unique collection name string.
 */
function collName() {
  return `coll-${Math.floor(Math.random() * 1e17).toString(16)}`
}

type AdapterSetupOptions = {
  version?: number,
  databaseName?: string,
  collectionName?: string,
  indices?: string[],
  schema?: Record<string, string[]>,
}

/**
 * Helper that prepares and eagerly sets up an IndexedDB adapter using the
 * current factory-based API.
 * @param options Adapter setup overrides.
 * @returns Adapter plus metadata for the created store.
 */
async function withAdapter(options: AdapterSetupOptions = {}) {
  const collectionName = options.collectionName ?? collName()
  const databaseName = options.databaseName ?? generateDatabaseName()
  const version = options.version ?? 1
  const schema = options.schema ?? { [collectionName]: options.indices ?? [] }

  const prepare = prepareIndexedDB({
    databaseName,
    version,
    schema,
  })

  const adapter = prepare<any, number>(collectionName)
  await adapter.setup()
  return { adapter, collectionName, databaseName }
}

describe('IndexedDB storage adapter', () => {
  describe('setup/teardown', () => {
    it('opens and closes with custom db & version', async () => {
      const { adapter } = await withAdapter({ version: 3 })
      await expect(adapter.teardown()).resolves.toBeUndefined()
    })

    it('throws when collection is missing from schema', async () => {
      const name = collName()
      const prepare = prepareIndexedDB({
        databaseName: generateDatabaseName(),
        version: 1,
        schema: {},
      })
      const adapter = prepare<any, number>(name)
      await expect(adapter.setup()).rejects.toThrow(`Object store "${name}" does not exist`)
    })
  })

  describe('CRUD operations', () => {
    let adapter: ReturnType<ReturnType<typeof prepareIndexedDB>>

    beforeEach(async () => {
      const setup = await withAdapter()
      adapter = setup.adapter
    })

    it('readAll returns [] initially', async () => {
      await expect(adapter.readAll()).resolves.toEqual([])
      await adapter.teardown()
    })

    it('supports insert, replace, remove and removeAll', async () => {
      await adapter.insert([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }])
      await expect(adapter.readAll()).resolves.toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ])

      await adapter.replace([{ id: 2, name: 'Janet' }])
      await expect(adapter.readIds([2, 3])).resolves.toEqual([{ id: 2, name: 'Janet' }])

      await adapter.remove([{ id: 1 }])
      await expect(adapter.readAll()).resolves.toEqual([{ id: 2, name: 'Janet' }])

      await adapter.removeAll()
      await expect(adapter.readAll()).resolves.toEqual([])
      await adapter.teardown()
    })

    it('treats replace on missing ids as an upsert while remove ignores missing ids', async () => {
      await adapter.insert([{ id: 1, name: 'Existing' }])
      await expect(adapter.replace([{ id: 99, name: 'Ghost' }])).resolves.toBeUndefined()
      await expect(adapter.remove([{ id: 42 }])).resolves.toBeUndefined()
      await expect(adapter.readAll()).resolves.toEqual([
        { id: 1, name: 'Existing' },
        { id: 99, name: 'Ghost' },
      ])
      await adapter.teardown()
    })
  })

  describe('index handling follows schema upgrades', () => {
    it('creates and drops indices based on schema definition', async () => {
      const databaseName = generateDatabaseName()
      const collectionName = collName()

      // Version 1: no indices yet
      {
        const { adapter } = await withAdapter({
          databaseName,
          collectionName,
          version: 1,
        })
        await expect(adapter.readIndex('name')).rejects.toThrow('does not exist')
        await adapter.teardown()
      }

      // Version 2: add "name" index and verify contents
      {
        const { adapter } = await withAdapter({
          databaseName,
          collectionName,
          version: 2,
          indices: ['name'],
        })
        await adapter.insert([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ])
        const index = await adapter.readIndex('name')
        expect(index.get('Alice')).toBeInstanceOf(Set)
        expect(index.get('Alice')?.has(1)).toBe(true)
        expect(index.get('Bob')?.has(2)).toBe(true)
        await adapter.teardown()
      }

      // Version 3: drop the index again via schema update
      {
        const { adapter } = await withAdapter({
          databaseName,
          collectionName,
          version: 3,
          indices: [],
        })
        await expect(adapter.readIndex('name')).rejects.toThrow('does not exist')
        await adapter.teardown()
      }
    })
  })

  describe('error handling', () => {
    it('allows readIds before setup by returning an empty array', async () => {
      const name = collName()
      const prepare = prepareIndexedDB({
        databaseName: generateDatabaseName(),
        version: 1,
        schema: { [name]: [] },
      })
      const adapter = prepare<any, number>(name)
      await expect(adapter.readIds([1])).resolves.toEqual([])
    })
  })
})
