import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the minimal pieces we need from @signaldb/core
vi.mock('@signaldb/core', () => {
  return {
    createStorageAdapter: (impl: any) => impl,
    get: (object: any, path: string) => {
      if (!path) return
      return path.split('.').reduce((accumulator: any, key: string) => (accumulator == null ? undefined : accumulator[key]), object)
    },
  }
})

import createGenericFSAdapter from '../src'

// A tiny in-memory driver matching the Driver interface used by the adapter
class MemDriver<T extends { id: I }, I> {
  files = new Map<string, any>()
  dirs = new Set<string>()
  deletedPaths: string[] = []

  async fileNameForId(id: I): Promise<string> {
    const s = String(id)
    return `${s.slice(0, 2)}/${s}`
  }

  async fileNameForIndexKey(key: string): Promise<string> {
    return String(key).replaceAll(/[\\/]/g, '_')
  }

  async joinPath(...parts: string[]): Promise<string> {
    return parts.join('/').replaceAll(/\/+/g, '/').replaceAll('//', '/')
  }

  async ensureDir(path: string): Promise<void> {
    this.dirs.add(path)
  }

  async fileExists(path: string): Promise<boolean> {
    if (this.files.has(path) || this.dirs.has(path)) return true
    const prefix = path.endsWith('/') ? path : path + '/'
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) return true
    }
    return false
  }

  async readObject(path: string): Promise<T[] | null> {
    const v = this.files.get(path)
    return v === undefined ? null : (v)
  }

  async writeObject(path: string, value: T[]): Promise<void> {
    this.files.set(path, value)
  }

  async readIndexObject(path: string): Promise<Record<string, I[]>[] | null> {
    const v = this.files.get(path)
    return v === undefined ? null : (v)
  }

  async writeIndexObject(path: string, value: Record<string, I[]>[]): Promise<void> {
    this.files.set(path, value)
  }

  async listFilesRecursive(directoryPath: string): Promise<string[]> {
    const prefix = directoryPath.endsWith('/') ? directoryPath : directoryPath + '/'
    const out: string[] = []
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) {
        const relative = k.slice(prefix.length)
        if (relative) out.push(relative)
      }
    }
    // de-dup and sort for determinism
    return [...new Set(out)].sort()
  }

  async removeEntry(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      const prefix = path.endsWith('/') ? path : path + '/'
      for (const k of this.files.keys()) {
        if (k === path || k.startsWith(prefix)) this.files.delete(k)
      }
      this.dirs.delete(path)
      this.deletedPaths.push(path + ' (recursive)')
    } else {
      this.files.delete(path)
      this.deletedPaths.push(path)
    }
  }
}

type Item = { id: string, status?: string, category?: string, nested?: { flag?: boolean } }

describe('createGenericFSAdapter (generic-fs)', () => {
  const folder = '/root/collection'
  let driver: MemDriver<Item, string>
  let adapter: ReturnType<typeof createGenericFSAdapter>

  beforeEach(async () => {
    driver = new MemDriver<Item, string>()
    adapter = createGenericFSAdapter<Item, string>(driver, folder) as any
    await adapter.setup()
  })

  it('setup creates the root folder and readAll returns [] when items dir is missing', async () => {
    expect(await driver.fileExists(folder)).toBe(true)
    const all = await adapter.readAll()
    expect(all).toEqual([])
  })

  it('insert, readAll, readIds work; duplicate insert errors; non-array files are ignored', async () => {
    const a: Item = { id: 'aa1', status: 'new', category: 'A/B', nested: { flag: true } }
    const b: Item = { id: 'bb2', status: 'new', nested: { flag: false } }

    // Seed a bogus non-array file under items to test readAll skipping
    const itemsDirectory = await driver.joinPath(folder, 'items')
    driver.files.set(await driver.joinPath(itemsDirectory, 'bogus'), 123)

    await adapter.insert([a, b])

    const all = await adapter.readAll()
    expect(all.map(x => x.id).sort()).toEqual(['aa1', 'bb2'])

    const ids = await adapter.readIds(['aa1', 'missing', 'bb2'])
    expect(ids.map(x => x.id).sort()).toEqual(['aa1', 'bb2'])

    // readIds ignores non-array file content
    const weirdIdPath = await driver.joinPath(itemsDirectory, await driver.fileNameForId('xx9'))
    driver.files.set(weirdIdPath, 'not-an-array')
    const ids2 = await adapter.readIds(['xx9'])
    expect(ids2).toEqual([])

    // Duplicate insert should throw
    await expect(adapter.insert([b])).rejects.toThrow('Item with id "bb2" already exists')

    // Insert into a file that currently contains non-array -> treated as []
    const preSeedPath = await driver.joinPath(itemsDirectory, await driver.fileNameForId('dd4'))
    driver.files.set(preSeedPath, 'garbage')
    await adapter.insert([{ id: 'dd4', status: 'new' }])
    const all2 = await adapter.readAll()
    expect(all2.some(x => x.id === 'dd4')).toBe(true)
  })

  it('createIndex builds an index; readIndex returns a Map; dropIndex errors when missing', async () => {
    const a: Item = { id: 'aa1', status: 'new' }
    const b: Item = { id: 'bb2', status: 'new' }
    const c: Item = { id: 'cc3' } // status undefined -> should be skipped in index
    await adapter.insert([a, b, c])

    // readIndex before index exists should throw
    await expect(adapter.readIndex('status')).rejects.toThrow('Index on field "status" does not exist')

    await adapter.createIndex('status')

    // After creating the index, it should exist and be readable
    const index = await adapter.readIndex('status')
    expect(index instanceof Map).toBe(true)
    expect([...index.get('new') ?? []]).toEqual(['aa1', 'bb2'])

    // readIndex ignores non-array index files
    const indexRoot = await driver.joinPath(folder, 'index')
    const indexPath = await driver.joinPath(indexRoot, await driver.fileNameForIndexKey('status'))
    driver.files.set(await driver.joinPath(indexPath, 'junk'), 456) // non-array -> skipped
    const index2 = await adapter.readIndex('status')
    expect([...index2.get('new') ?? []].sort()).toEqual(['aa1', 'bb2'])

    // Drop missing index -> error
    await expect(adapter.dropIndex('nonexistent')).rejects.toThrow('Index on field "nonexistent" does not exist')

    // Drop existing index
    await adapter.dropIndex('status')
    await expect(adapter.readIndex('status')).rejects.toThrow('Index on field "status" does not exist')
  })

  it('indices are maintained on insert/replace/remove across multiple fields', async () => {
    const a: Item = { id: 'aa1', status: 'new', nested: { flag: true } }
    const b: Item = { id: 'bb2', status: 'new', nested: { flag: false } }
    await adapter.insert([a, b])

    await adapter.createIndex('status')
    await adapter.createIndex('nested.flag')

    // Insert triggers index update
    const c: Item = { id: 'cc3', status: 'done', nested: { flag: false } }
    await adapter.insert([c])
    let statusIndex = await adapter.readIndex('status')
    const flagIndex = await adapter.readIndex('nested.flag')
    expect(new Set(statusIndex.get('new'))).toEqual(new Set(['aa1', 'bb2']))
    expect(new Set(statusIndex.get('done'))).toEqual(new Set(['cc3']))
    expect(new Set(flagIndex.get('true'))).toEqual(new Set(['aa1']))
    expect(new Set(flagIndex.get('false'))).toEqual(new Set(['bb2', 'cc3']))

    // Replace bb2 -> status changes, indices updated once replace completes
    await adapter.replace([{ id: 'bb2', status: 'archived', nested: { flag: false } }])
    statusIndex = await adapter.readIndex('status')
    expect(new Set(statusIndex.get('new') ?? [])).toEqual(new Set(['aa1']))
    expect(new Set(statusIndex.get('archived') ?? [])).toEqual(new Set(['bb2']))

    // Replace non-existent -> throws and does not mutate
    await expect(adapter.replace([{ id: 'zz9', status: 'noop' } as Item])).rejects.toThrow('Item with id "zz9" does not exist')

    // Remove: one file becomes empty -> driver.removeEntry(filePath) branch; others rewritten
    await adapter.remove([{ id: 'cc3' }])
    statusIndex = await adapter.readIndex('status')
    expect(statusIndex.get('done')).toBeUndefined()
    expect(driver.deletedPaths.some(p => p.includes('cc'))).toBe(true) // ensure empty-file deletion path taken

    // Remove non-existent -> error
    await expect(adapter.remove([{ id: 'zz9' } as Item])).rejects.toThrow('Item with id "zz9" does not exist')
  })

  it('removeAll removes the whole folder recursively only if it exists; teardown is a no-op', async () => {
    // With contents
    await adapter.insert([{ id: 'aa1', status: 'x' }])
    await adapter.removeAll()
    expect(await driver.fileExists(folder)).toBe(false)

    // Idempotent: calling again when missing
    await expect(adapter.removeAll()).resolves.toBeUndefined()

    // Cover teardown line
    await expect(adapter.teardown()).resolves.toBeUndefined()
  })
})
