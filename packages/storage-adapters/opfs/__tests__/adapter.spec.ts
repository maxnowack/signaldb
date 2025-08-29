// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import createOPFSAdapter from '../src'

/**
 * In-memory mock of OPFS (Origin Private File System)
 * so the adapter can run in happy-dom.
 */
const fileContents: Record<string, string | null> = {}
const directories = new Set<string>([''])
const norm = (p: string) => p.replaceAll(/\\+/g, '/').replace(/\/\/+/, '/').replace(/^\/$/, '')
const joinPath = (base: string, name: string) => norm([base, name].filter(Boolean).join('/'))
const hasAnyFileWithPrefix = (prefix: string) => Object.keys(fileContents).some(k => k.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))

/**
 * Creates a mock directory handle.
 * @param basePath The base path.
 * @returns The directory handle.
 */
function makeDirectory(basePath: string) {
  return {
    async getDirectoryHandle(dirname: string, options?: { create: boolean }) {
      const newBase = joinPath(basePath, dirname)
      if (options?.create) {
        // mark directory and all parents as existing
        const parts = newBase.split('/').filter(Boolean)
        for (let i = 0; i <= parts.length; i++) {
          directories.add(parts.slice(0, i).join('/'))
        }
        return makeDirectory(newBase)
      }
      if (!directories.has(newBase) && !hasAnyFileWithPrefix(newBase)) {
        throw new Error('Directory not found')
      }
      return makeDirectory(newBase)
    },
    async getFileHandle(filename: string, options?: { create: boolean }) {
      const full = joinPath(basePath, filename)
      if (!Object.prototype.hasOwnProperty.call(fileContents, full)) {
        if (options?.create) {
          // ensure parent dirs exist
          const parts = full.split('/').filter(Boolean)
          for (let i = 0; i < parts.length; i++) {
            const directory = parts.slice(0, i).join('/')
            directories.add(directory)
          }
          fileContents[full] = null
        } else {
          throw new Error('File not found')
        }
      }
      const fileHandle = {
        async getFile() {
          return {
            async text() {
              return fileContents[full]
            },
          }
        },
        async createWritable() {
          return {
            async write(data: string) {
              fileContents[full] = data
            },
            async close() {
              // no-op
            },
          }
        },
      }
      return fileHandle
    },
    async removeEntry(name: string, options?: { recursive?: boolean }) {
      const target = joinPath(basePath, name)
      const prefix = target.endsWith('/') ? target : `${target}/`
      // delete files under target and file exactly at target
      for (const k of Object.keys(fileContents)) {
        if (k === target || k.startsWith(prefix)) delete fileContents[k]
      }
      // delete dirs under target
      for (const d of directories) {
        if (d === target || d.startsWith(prefix)) directories.delete(d)
      }
      void options
    },
    async* values() {
      const prefix = basePath ? `${basePath}/` : ''
      for (const key of Object.keys(fileContents)) {
        if (!key.startsWith(prefix)) continue
        yield {
          kind: 'file',
          async getFile() {
            return { async text() {
              return fileContents[key]
            } }
          },
        } as any
      }
    },
  }
}

const mockedOPFS = {
  getDirectory: () => Promise.resolve(makeDirectory('') as any),
}

// @ts-expect-error mocking navigator.storage for testing purposes
navigator.storage = mockedOPFS

/**
 * Generates a random folder name for isolation between tests.
 * @returns The folder name.
 */
function generateFolderName() {
  return `sdb-opfs-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Sets up an OPFS adapter with optional pre-index / pre-drop actions to
 * keep parity with the filesystem adapter tests.
 * @param options The options.
 * @param options.folderName The folder name to use.
 * @param options.preIndex The indexes to create before setup.
 * @param options.preDrop The indexes to drop before setup.
 * @returns The adapter and folder name.
 */
async function withAdapter(
  options?: {
    folderName?: string,
    preIndex?: string[],
    preDrop?: string[],
  },
) {
  const folderName = options?.folderName ?? generateFolderName()
  const adapter = createOPFSAdapter<any, string>(folderName)

  // Enqueue index mutations BEFORE setup (parity with other adapters)
  for (const f of options?.preIndex ?? []) {
    await adapter.createIndex(f)
  }
  for (const f of options?.preDrop ?? []) {
    await adapter.dropIndex(f).catch(() => {}) // ignore if it doesn't exist yet
  }

  await adapter.setup()
  return { adapter, folderName }
}

// NOTE: These tests mirror the Filesystem adapter tests to ensure
// behavioral parity where applicable.

describe('OPFS storage adapter', () => {
  describe('setup/teardown', () => {
    it('creates the folder and tears down cleanly', async () => {
      const { adapter } = await withAdapter()
      await adapter.teardown()
      expect(true).toBe(true)
    })
  })

  describe('CRUD + indexing', () => {
    let adapter: ReturnType<typeof createOPFSAdapter<any, string>>

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
        const { adapter: opfs } = await withAdapter({ folderName })
        await expect(opfs.readIndex('id')).rejects.toThrow('does not exist')
        await opfs.teardown()
      }

      // Phase 2: create index and verify mapping after insert
      {
        const { adapter: opfs } = await withAdapter({ folderName, preIndex: ['id'] })
        await opfs.insert([{ id: '1', name: 'John' }])
        const map = await opfs.readIndex('id')
        expect(map instanceof Map).toBe(true)
        expect(map.has('1')).toBe(true)
        const set = map.get('1')
        expect(set instanceof Set).toBe(true)
        await opfs.teardown()
      }

      // Phase 3: drop index and verify subsequent reads fail
      {
        const { adapter: opfs } = await withAdapter({ folderName, preDrop: ['id'] })
        await expect(opfs.readIndex('id')).rejects.toThrow('does not exist')
        await opfs.teardown()
      }
    })

    it('replace throws when id not found; remove throws when id not found (parity with FS)', async () => {
      const { adapter: opfs } = await withAdapter({ preIndex: ['id'] })
      await opfs.insert([{ id: '1', name: 'John' }])

      await expect(opfs.replace([{ id: '999', name: 'Ghost' }])).rejects.toThrow('does not exist')
      await expect(opfs.remove([{ id: '999' }])).rejects.toThrow('does not exist')

      const items = await opfs.readAll()
      expect(items).toEqual([{ id: '1', name: 'John' }])
      await opfs.teardown()
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
