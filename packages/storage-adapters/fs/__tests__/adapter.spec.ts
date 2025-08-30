import { describe, it, expect, beforeEach } from 'vitest'
import createFilesystemAdapter from '../src'

/**
 * Generates a random folder name under /tmp for isolation between tests.
 * @returns A unique folder name string.
 */
function generateFolderName() {
  return `/tmp/sdb-fs-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Sets up a Filesystem adapter with optional pre-index / pre-drop actions
 * @param options - Configuration options for the adapter setup.
 * @param options.folderName - The folder name to use (default: randomly generated).
 * @param options.preIndex - Array of index names to create before setup.
 * @param options.preDrop - Array of index names to drop before setup.
 * @returns An object containing the initialized adapter and the folder name.
 */
async function withAdapter(
  options?: {
    folderName?: string,
    preIndex?: string[],
    preDrop?: string[],
  },
) {
  const folderName = options?.folderName ?? generateFolderName()

  const adapter = createFilesystemAdapter<any, string>(folderName)

  // Enqueue index mutations BEFORE setup (keeps parity with IndexedDB tests)
  for (const f of options?.preIndex ?? []) {
    await adapter.createIndex(f)
  }
  for (const f of options?.preDrop ?? []) {
    await adapter.dropIndex(f).catch(() => {}) // ignore if it doesn't exist yet
  }

  await adapter.setup()
  return { adapter, folderName }
}

// NOTE: These tests are intentionally modeled after the IndexedDB adapter tests
// to keep behavior parity where applicable. Some expectations differ where the
// filesystem adapter has stricter semantics (e.g., replace/remove throw if id is missing).

describe('Filesystem storage adapter', () => {
  describe('setup/teardown', () => {
    it('creates the folder and tears down cleanly', async () => {
      const { adapter } = await withAdapter()
      await adapter.teardown()
      expect(true).toBe(true)
    })
  })

  describe('CRUD + indexing', () => {
    let adapter: ReturnType<typeof createFilesystemAdapter<any, string>>

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
      await adapter.insert([{ id: '1', name: 'John' }])
      const items = await adapter.readAll()
      expect(items).toEqual([{ id: '1', name: 'John' }])
      await adapter.teardown()
    })

    it('createIndex / readIndex / dropIndex work and errors are surfaced', async () => {
      const folderName = generateFolderName()

      // Phase 1: no index exists yet → readIndex should throw
      {
        const { adapter: fsAdapter } = await withAdapter({ folderName })
        await expect(fsAdapter.readIndex('id')).rejects.toThrow('does not exist')
        await fsAdapter.teardown()
      }

      // Phase 2: create index and verify mapping after insert
      {
        const { adapter: fsAdapter } = await withAdapter({ folderName, preIndex: ['id'] })
        await fsAdapter.insert([{ id: '1', name: 'John' }])
        const map = await fsAdapter.readIndex('id')
        expect(map instanceof Map).toBe(true)
        expect(map.has('1')).toBe(true)
        const set = map.get('1')
        expect(set instanceof Set).toBe(true)
        await fsAdapter.teardown()
      }

      // Phase 3: drop index and verify subsequent reads fail
      {
        const { adapter: fsAdapter } = await withAdapter({ folderName, preDrop: ['id'] })
        await expect(fsAdapter.readIndex('id')).rejects.toThrow('does not exist')
        await fsAdapter.teardown()
      }
    })

    it('replace throws when id not found; remove throws when id not found (stricter than IDB)', async () => {
      const { adapter: fsAdapter } = await withAdapter({ preIndex: ['id'] })
      await fsAdapter.insert([{ id: '1', name: 'John' }])

      await expect(fsAdapter.replace([{ id: '999', name: 'Ghost' }])).rejects.toThrow('does not exist')
      await expect(fsAdapter.remove([{ id: '999' }])).rejects.toThrow('does not exist')

      const items = await fsAdapter.readAll()
      expect(items).toEqual([{ id: '1', name: 'John' }])
      await fsAdapter.teardown()
    })

    it('removeAll clears the store', async () => {
      await adapter.insert([
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' },
      ])
      await adapter.removeAll()
      const items = await adapter.readAll()
      expect(items).toEqual([])
      await adapter.teardown()
    })

    it('readIds accepts an array of ids and returns [] when nothing was found', async () => {
      const result = await adapter.readIds(['does-not-exist'])
      expect(result).toEqual([])
      await adapter.teardown()
    })
  })
})
