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
            async write(data: any) {
              if (typeof data === 'string') {
                fileContents[full] = data
              } else if (data && typeof data === 'object' && 'data' in data) {
                const buffer = data.data as Uint8Array
                fileContents[full] = new TextDecoder().decode(buffer)
              }
            },
            async close() {
              // no-op
            },
            async truncate() {
              // no-op
            },
            async abort() {
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
      for (const k of Object.keys(fileContents)) {
        if (k === target || k.startsWith(prefix)) delete fileContents[k]
      }
      for (const directory of directories) {
        if (directory === target || directory.startsWith(prefix)) directories.delete(directory)
      }
      void options
    },
    async* values() {
      const prefix = basePath ? `${basePath}/` : ''

      for (const directory of directories) {
        if (!directory.startsWith(prefix) || directory === basePath) continue
        const relativePath = directory.slice(prefix.length)
        if (relativePath && !relativePath.includes('/')) {
          yield {
            kind: 'directory',
            name: relativePath,
          } as any
        }
      }

      for (const key of Object.keys(fileContents)) {
        if (!key.startsWith(prefix)) continue
        const relativePath = key.slice(prefix.length)
        if (relativePath && !relativePath.includes('/')) {
          yield {
            kind: 'file',
            name: relativePath,
            async getFile() {
              return { async text() {
                return fileContents[key]
              } }
            },
          } as any
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
})
