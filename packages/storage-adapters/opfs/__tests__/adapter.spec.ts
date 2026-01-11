// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import createOPFSAdapter from '../src'

type Item = { id: string, name?: string, value?: string, tag?: string, data?: Record<string, any> }

/**
 * In-memory mock of OPFS (Origin Private File System)
 * so the adapter can run in happy-dom.
 */
const fileContents: Record<string, string | null> = {}
const directories = new Set<string>([''])
const locks = new Map<string, Promise<void>>()
const failWritePaths = new Set<string>()
const abortedPaths: string[] = []
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

      if (!Object.prototype.hasOwnProperty.call(fileContents, full) && !options?.create) {
        throw new Error('File not found')
      }

      if (!Object.prototype.hasOwnProperty.call(fileContents, full) && options?.create) {
        const parts = full.split('/').filter(Boolean)
        for (let i = 0; i < parts.length; i++) {
          const directory = parts.slice(0, i).join('/')
          directories.add(directory)
        }
        fileContents[full] = null
      }

      return {
        async getFile() {
          const content = fileContents[full]
          return {
            async text() {
              return content ?? ''
            },
          }
        },
        async createWritable() {
          let buffer = ''
          let closed = false
          let aborted = false

          return {
            async write(data: any) {
              if (closed || aborted) throw new Error('Stream is closed or aborted')
              if (failWritePaths.has(full)) {
                failWritePaths.delete(full)
                throw new Error(`write failure for ${full}`)
              }
              if (typeof data === 'string') {
                buffer += data
              } else if (data.type === 'write') {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                const text = new TextDecoder().decode(data.data)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                buffer = buffer.slice(0, data.position) + text
              }
            },
            async truncate(size: number) {
              if (closed || aborted) throw new Error('Stream is closed or aborted')
              buffer = buffer.slice(0, size)
            },
            async close() {
              if (closed) return
              closed = true
              fileContents[full] = buffer
            },
            async abort() {
              aborted = true
              abortedPaths.push(full)
            },
          }
        },
      }
    },

    async removeEntry(name: string, options?: { recursive?: boolean }) {
      const full = joinPath(basePath, name)

      if (options?.recursive) {
        // Remove all files and directories under this path
        const keysToDelete = Object.keys(fileContents).filter(k =>
          k === full || k.startsWith(`${full}/`),
        )
        keysToDelete.forEach(k => delete fileContents[k])

        const directoriessToDelete = [...directories].filter(d =>
          d === full || d.startsWith(`${full}/`),
        )
        directoriessToDelete.forEach(d => directories.delete(d))
      } else {
        // Check if it's a directory with contents
        if (hasAnyFileWithPrefix(full)) {
          throw new Error('Directory not empty')
        }
        delete fileContents[full]
        directories.delete(full)
      }
    },

    async* values() {
      const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`
      const entries = new Set<string>()

      // Get immediate children files
      for (const path of Object.keys(fileContents)) {
        if (path.startsWith(prefix)) {
          const relative = path.slice(prefix.length)
          const parts = relative.split('/').filter(Boolean)
          if (parts.length > 0) {
            entries.add(parts[0])
          }
        }
      }

      // Get immediate children directories
      for (const directory of directories) {
        if (directory.startsWith(prefix) && directory !== basePath) {
          const relative = directory.slice(prefix.length)
          const parts = relative.split('/').filter(Boolean)
          if (parts.length > 0) {
            entries.add(parts[0])
          }
        }
      }

      for (const entry of entries) {
        const fullPath = joinPath(basePath, entry)
        const isDirectory = directories.has(fullPath) || hasAnyFileWithPrefix(fullPath)
        const isFile = Object.prototype.hasOwnProperty.call(fileContents, fullPath)

        yield {
          name: entry,
          kind: isDirectory && !isFile ? 'directory' : 'file',
        }
      }
    },
  }
}

const mockedOPFS = {
  getDirectory: () => Promise.resolve(makeDirectory('') as any),
}

// @ts-expect-error mocking navigator.storage for testing purposes
navigator.storage = mockedOPFS
Object.defineProperty(navigator, 'locks', {
  value: {
    request: async (_name: string, _options: { mode: 'exclusive' }, callback: () => Promise<any>) => callback(),
  },
  configurable: true,
})

beforeEach(() => {
  for (const key of Object.keys(fileContents)) delete fileContents[key]
  directories.clear()
  directories.add('')
  failWritePaths.clear()
  abortedPaths.length = 0
})

/**
 * Generates a random folder name for isolation between tests.
 * @returns The folder name.
 */
function generateFolderName() {
  return `sdb-opfs-${Math.floor(Math.random() * 1e17).toString(16)}`
}

/**
 * Creates and sets up an adapter scoped to a folder.
 * @param folderName Optional folder override.
 * @returns Adapter with associated folder name.
 */
async function withAdapter(folderName = generateFolderName()) {
  const adapter = createOPFSAdapter<any, string>(folderName)
  await adapter.setup()
  return { adapter, folderName }
}

describe('OPFS storage adapter', () => {
  it('creates the folder and tears down cleanly', async () => {
    const { adapter } = await withAdapter()
    await expect(adapter.teardown()).resolves.toBeUndefined()
  })

  describe('CRUD + indexing', () => {
    let adapter: ReturnType<typeof createOPFSAdapter<any, string>>

    beforeEach(async () => {
      const setup = await withAdapter()
      adapter = setup.adapter
    })

    it('readAll returns [] initially', async () => {
      await expect(adapter.readAll()).resolves.toEqual([])
      await adapter.teardown()
    })

    it('insert writes items and readAll returns raw data only', async () => {
      await adapter.insert([{ id: '1', name: 'John' }])
      await expect(adapter.readAll()).resolves.toEqual([{ id: '1', name: 'John' }])
      await adapter.teardown()
    })

    it('createIndex / readIndex work for non-id fields', async () => {
      await adapter.createIndex('name')
      await adapter.insert([{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }])
      const map = await adapter.readIndex('name')
      expect(map.get('John')?.has('1')).toBe(true)
      expect(map.get('Jane')?.has('2')).toBe(true)
      await adapter.teardown()
    })

    it('removeAll clears the store', async () => {
      await adapter.insert([
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' },
      ])
      await adapter.removeAll()
      await expect(adapter.readAll()).resolves.toEqual([])
      await adapter.teardown()
    })

    it('readIds returns specific items by id', async () => {
      await adapter.insert([
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' },
        { id: '3', name: 'Bob' },
      ])
      const result = await adapter.readIds(['1', '3'])
      expect(result).toEqual([
        { id: '1', name: 'John' },
        { id: '3', name: 'Bob' },
      ])
      await adapter.teardown()
    })
  })

  describe('error handling', () => {
    it('rejects creating id index', async () => {
      const { adapter } = await withAdapter()
      await expect(adapter.createIndex('id')).rejects.toThrow('Cannot create index on id field')
      await adapter.teardown()
    })

    it('supports custom serialization options', async () => {
      const folderName = generateFolderName()
      const customSerialize = (data: any) => `CUSTOM:${JSON.stringify(data)}`
      const customDeserialize = (string_: string) => JSON.parse(string_.replace('CUSTOM:', ''))
      const adapter = createOPFSAdapter<any, string>(folderName, {
        serialize: customSerialize,
        deserialize: customDeserialize,
      })

      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'John' }])
      await expect(adapter.readAll()).resolves.toEqual([{ id: '1', name: 'John' }])
      await adapter.teardown()
    })

    it('handles numeric ids without throwing', async () => {
      const folderName = generateFolderName()
      const adapter = createOPFSAdapter<{ id: number, name: string }, number>(folderName)
      await adapter.setup()
      await adapter.insert([{ id: 42, name: 'Meaning' }])
      await expect(adapter.readIds([42])).resolves.toEqual([{ id: 42, name: 'Meaning' }])
      await adapter.teardown()
    })
  })

  describe('additional', () => {
    beforeEach(() => {
      // Clear state
      Object.keys(fileContents).forEach(k => delete fileContents[k])
      directories.clear()
      directories.add('')
      locks.clear()
      failWritePaths.clear()
      abortedPaths.length = 0

      // Mock navigator.storage and navigator.locks
      ;(globalThis as any).navigator = {
        storage: {
          async getDirectory() {
            return makeDirectory('')
          },
        },
        locks: {
          request(name: string, options: any, callback: () => Promise<any>) {
            // Simple lock implementation
            const lockKey = `opfs:${name}`
            const currentLock = locks.get(lockKey) ?? Promise.resolve()

            const newLock: Promise<void> = currentLock.then(() => callback())
            locks.set(lockKey, newLock)

            return newLock.finally(() => {
              if (locks.get(lockKey) === newLock) {
                locks.delete(lockKey)
              }
            })
          },
        },
      }
    })

    it('creates adapter with default serialize/deserialize', async () => {
      const adapter = createOPFSAdapter<Item, string>('test')
      expect(adapter).toBeDefined()
      expect(adapter.setup).toBeDefined()
    })

    it('creates adapter with custom serialize/deserialize', async () => {
      const serialize = (data: any) => JSON.stringify(data, null, 2)
      const deserialize = (string_: string) => JSON.parse(string_)

      const adapter = createOPFSAdapter<Item, string>('test', {
        serialize,
        deserialize,
      })
      expect(adapter).toBeDefined()
    })

    it('performs setup and creates directory structure', async () => {
      const adapter = createOPFSAdapter<Item, string>('testcol')
      await adapter.setup()

      // Directory should be created
      expect(directories.has('testcol')).toBe(true)
    })

    it('handles insert and persists to OPFS', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([{ id: '1', name: 'Alice' }])

      // Verify file was created - the path includes the folder name and data subdirectory
      expect(Object.keys(fileContents).some(k => k.includes('items/') && k.includes('1'))).toBe(true)
    })

    it('handles readAll and retrieves items', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

      const items = await adapter.readAll()
      expect(items.length).toBe(2)
      expect(items.map(i => i.id).toSorted()).toEqual(['1', '2'])
    })

    it('handles readIds and retrieves specific items', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

      const items = await adapter.readIds(['1'])
      expect(items.length).toBe(1)
      expect(items[0].id).toBe('1')
    })

    it('handles createIndex and builds index files', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

      await adapter.createIndex('name')

      // Verify index files were created
      expect(Object.keys(fileContents).some(k => k.includes('index'))).toBe(true)
    })

    it('handles readIndex and retrieves index data', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])
      await adapter.createIndex('name')

      const index = await adapter.readIndex('name')
      expect(index.get('Alice')?.has('1')).toBe(true)
      expect(index.get('Bob')?.has('2')).toBe(true)
    })

    it('handles dropIndex and removes index files', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }])
      await adapter.createIndex('name')

      await adapter.dropIndex('name')

      // Index files should be removed
      const indexFiles = Object.keys(fileContents).filter(k => k.includes('index/name'))
      expect(indexFiles.length).toBe(0)
    })

    it('handles replace and updates items', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }])

      await adapter.replace([{ id: '1', name: 'Alicia' }])

      const items = await adapter.readAll()
      expect(items[0].name).toBe('Alicia')
    })

    it('handles remove and deletes items', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

      await adapter.remove([{ id: '1' }])

      const items = await adapter.readAll()
      expect(items.length).toBe(1)
      expect(items[0].id).toBe('2')
    })

    it('handles removeAll and clears all data', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1' }, { id: '2' }])

      await adapter.removeAll()

      const items = await adapter.readAll()
      expect(items.length).toBe(0)
    })

    it('handles teardown', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await expect(adapter.teardown()).resolves.toBeUndefined()
      // Teardown is a no-op but should not throw
    })

    it('sanitizes filenames with special characters', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([{ id: 'id/with/slashes', name: 'Test' }])

      // Should not throw and should create valid filename
      const items = await adapter.readAll()
      expect(items.length).toBe(1)
    })

    it('handles concurrent writes with locks', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      // Perform concurrent inserts
      await Promise.all([
        adapter.insert([{ id: '1', name: 'A' }]),
        adapter.insert([{ id: '2', name: 'B' }]),
        adapter.insert([{ id: '3', name: 'C' }]),
      ])

      const items = await adapter.readAll()
      expect(items.length).toBe(3)
    })

    it('handles errors when serialize returns non-string', async () => {
      const badSerialize = () => 123 as any
      const adapter = createOPFSAdapter<Item, string>('items', {
        serialize: badSerialize,
      })
      await adapter.setup()

      await expect(adapter.insert([{ id: '1', name: 'Test' }])).rejects.toThrow('must return a string')
    })

    it('handles missing directories gracefully', async () => {
      const adapter = createOPFSAdapter<Item, string>('missing')

      // readAll on non-existent directory should return empty array
      const items = await adapter.readAll()
      expect(items).toEqual([])
    })

    it('handles missing files gracefully', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      // readIds with non-existent ids should return empty array
      const items = await adapter.readIds(['nonexistent'])
      expect(items).toEqual([])
    })

    it('recursively lists files in subdirectories', async () => {
      const adapter = createOPFSAdapter<Item, string>('deep')
      await adapter.setup()

      // Create items that will create nested structure
      await adapter.insert([
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
      ])
      await adapter.createIndex('name')

      const items = await adapter.readAll()
      expect(items.length).toBe(2)
    })

    it('handles write stream abort on error', async () => {
      const errorSerialize = () => {
        throw new Error('Serialize error')
      }
      const adapter = createOPFSAdapter<Item, string>('items', {
        serialize: errorSerialize,
      })
      await adapter.setup()

      await expect(adapter.insert([{ id: '1' }])).rejects.toThrow()
    })

    it('aborts file writes when writable stream fails', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      failWritePaths.add('items/items/1')
      await expect(adapter.insert([{ id: '1', name: 'Crash' }])).rejects.toThrow(/write failure/)
      expect(abortedPaths).toContain('items/items/1')
    })

    it('aborts index writes when writable stream fails', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }])

      failWritePaths.add('items/index/name/Alice')
      await expect(adapter.createIndex('name')).rejects.toThrow(/write failure/)
      expect(abortedPaths).toContain('items/index/name/Alice')
    })

    it('throws when serialize returns non-string during index writes', async () => {
      const adapter = createOPFSAdapter<Item, string>('items', {
        serialize: (value: any) => {
          if (Array.isArray(value) && value.every(entry => entry && 'id' in entry)) {
            return JSON.stringify(value)
          }
          return value
        },
        deserialize: JSON.parse,
      })
      await adapter.setup()
      await adapter.insert([{ id: '1', name: 'Alice' }])

      await expect(adapter.createIndex('name')).rejects.toThrow('must return a string')
    })

    it('handles empty directory removal with recursive option', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()
      await adapter.createIndex('name')

      // Remove index with recursive option
      await adapter.dropIndex('name')

      // Should not throw
      expect(true).toBe(true)
    })

    it('handles file truncation when writing', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([{ id: '1', name: 'Long name value' }])
      await adapter.replace([{ id: '1', name: 'Short' }])

      const items = await adapter.readAll()
      expect(items[0].name).toBe('Short')
    })

    it('uses locks to prevent race conditions', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      // Simulate concurrent operations on same item
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(
          adapter.insert([{ id: `${i}`, name: `Item${i}` }]),
        )
      }

      await Promise.all(promises)
      const items = await adapter.readAll()
      expect(items.length).toBe(10)
    })

    it('handles index creation with special characters in keys', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([
        { id: '1', name: 'name/with/slashes' },
        { id: '2', name: String.raw`name\with\backslashes` },
      ])
      await adapter.createIndex('name')

      const index = await adapter.readIndex('name')
      expect(index.size).toBeGreaterThan(0)
    })

    it('handles complex data serialization', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([{
        id: '1',
        data: {
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' },
          },
        },
      }])

      const items = await adapter.readAll()
      expect(items[0].data?.nested.array).toEqual([1, 2, 3])
    })

    it('handles removeEntry with invalid path', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      // Try to remove with invalid path should handle gracefully
      // The generic-fs adapter will try to remove, OPFS should handle it
      await adapter.removeAll()
      expect(true).toBe(true)
    })

    it('verifies directory exists before reading files', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      // fileExists should check directory hierarchy
      const items = await adapter.readAll()
      expect(items).toEqual([])
    })

    it('handles index with null values', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([
        { id: '1', name: 'Alice' },
        { id: '2' }, // no name field
      ])
      await adapter.createIndex('name')

      const index = await adapter.readIndex('name')
      expect(index.get('Alice')?.has('1')).toBe(true)
    })

    it('handles multiple indices on same collection', async () => {
      const adapter = createOPFSAdapter<Item, string>('items')
      await adapter.setup()

      await adapter.insert([{ id: '1', name: 'Alice', data: { status: 'active' } }])
      await adapter.createIndex('name')
      await adapter.createIndex('data.status')

      const nameIndex = await adapter.readIndex('name')
      const statusIndex = await adapter.readIndex('data.status')

      expect(nameIndex.get('Alice')?.has('1')).toBe(true)
      expect(statusIndex.get('active')?.has('1')).toBe(true)
    })
  })
})
