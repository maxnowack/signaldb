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
      const { adapter: a } = await withAdapter({ preIndex: ['id'] })
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
  })
})
