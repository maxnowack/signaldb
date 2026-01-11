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
import { addDeltaForChange, accumulateUpsertDelta, type IndexDelta } from '../src/deltaHelpers'

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
    return [...new Set(out)].toSorted()
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
    expect(all.map(x => x.id).toSorted()).toEqual(['aa1', 'bb2'])

    const ids = await adapter.readIds(['aa1', 'missing', 'bb2'])
    expect(ids.map(x => x.id).toSorted()).toEqual(['aa1', 'bb2'])

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
    expect([...index2.get('new') ?? []].toSorted()).toEqual(['aa1', 'bb2'])

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
    const remainingNew = statusIndex.get('new')
      ? new Set(statusIndex.get('new'))
      : new Set<string>()
    const archived = statusIndex.get('archived')
      ? new Set(statusIndex.get('archived'))
      : new Set<string>()
    expect(remainingNew).toEqual(new Set(['aa1']))
    expect(archived).toEqual(new Set(['bb2']))

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

  it('tracks index deltas when values change to and from null', async () => {
    const item: Item = { id: 'aa1', status: 'new', category: 'A' }
    await adapter.insert([item])

    await adapter.createIndex('category')

    await adapter.replace([{ id: 'aa1', status: 'new', category: null as any }])
    let index = await adapter.readIndex('category')
    expect(index.get('A')).toBeUndefined()

    await adapter.replace([{ id: 'aa1', status: 'new', category: 'B' }])
    index = await adapter.readIndex('category')
    expect(index.get('B')).toEqual(new Set(['aa1']))
  })

  it('covers delta helpers for value transitions without touching production code', () => {
    const deltas = new Map<string, IndexDelta<string>>()
    addDeltaForChange(deltas, 'status', 'active', null, 'aa1')
    expect(deltas.get('status')?.removes.get('active')?.has('aa1')).toBe(true)

    addDeltaForChange(deltas, 'status', null, 'done', 'aa1')
    expect(deltas.get('status')?.adds.get('done')?.has('aa1')).toBe(true)

    const accumulateDeltas = new Map<string, IndexDelta<string>>()
    const indicesToMaintain = ['status']
    accumulateUpsertDelta(
      accumulateDeltas,
      indicesToMaintain,
      { id: 'aa1', status: 'active' },
      { id: 'aa1', status: null },
    )

    expect(accumulateDeltas.get('status')?.removes.get('active')?.has('aa1')).toBe(true)
  })

  it('removeAll removes the whole folder recursively only if it exists; teardown is a no-op', async () => {
    // With contents
    await adapter.insert([{ id: 'aa1', status: 'x' }])
    await adapter.removeAll()
    expect(await driver.fileExists(folder)).toBe(false)

    // Idempotent: calling again when missing
    await expect(adapter.removeAll()).resolves.toBeUndefined()

    // Cover teardown
    await expect(adapter.teardown()).resolves.toBeUndefined()
  })

  it('readAll handles fileExists error gracefully', async () => {
    // Create a driver that throws an error on fileExists
    const errorDriver = new MemDriver<Item, string>()
    errorDriver.fileExists = vi.fn().mockRejectedValue(new Error('Access denied'))

    const errorAdapter = createGenericFSAdapter<Item, string>(errorDriver, folder) as any
    await errorAdapter.setup()

    const items = await errorAdapter.readAll()
    expect(items).toEqual([])
  })

  it('covers index delta application edge cases', async () => {
    // Test applyIndexDeltas when index doesn't exist
    const a: Item = { id: 'aa1', status: 'new' }
    await adapter.insert([a])

    // Create index first
    await adapter.createIndex('status')

    // Now modify the item to trigger delta application
    await adapter.replace([{ id: 'aa1', status: 'updated' }])

    const index = await adapter.readIndex('status')
    expect(index.get('updated')).toEqual(new Set(['aa1']))
  })

  it('covers removeEntry with non-recursive option', async () => {
    const a: Item = { id: 'aa1', status: 'new' }
    await adapter.insert([a])

    // Remove without recursive option
    await adapter.remove([a])
    expect(driver.deletedPaths).toContain('/root/collection/items/aa/aa1')
  })

  it('covers index bucket removal when empty', async () => {
    const a: Item = { id: 'aa1', status: 'temp' }
    await adapter.insert([a])
    await adapter.createIndex('status')

    // Remove the only item with this status to trigger bucket deletion
    await adapter.remove([a])

    const index = await adapter.readIndex('status')
    expect(index.get('temp')).toBeUndefined()
  })

  it('removes from a non-empty bucket by rewriting the file', async () => {
    // Use a bucketed driver so multiple ids share the same file
    class BucketDriver<T extends { id: I }, I> extends MemDriver<T, I> {
      override async fileNameForId(): Promise<string> {
        // Force all items into a single shard file
        return 'bucket/shared.json'
      }
    }

    const bucketDriver = new BucketDriver<Item, string>()
    const bucketAdapter = createGenericFSAdapter<Item, string>(bucketDriver, folder) as any
    await bucketAdapter.setup()

    const a: Item = { id: 'aa1', status: 'keep' }
    const b: Item = { id: 'bb2', status: 'remove' }
    // Insert sequentially to avoid concurrent writes clobbering the same shard
    await bucketAdapter.insert([a])
    await bucketAdapter.insert([b])

    // Remove only b; since the shard still contains a, the file must be rewritten, not deleted
    await bucketAdapter.remove([b])

    const shardPath = await bucketDriver.joinPath(folder, 'items', 'bucket/shared.json')
    // Ensure the file was rewritten (not deleted) and only contains item a
    const remaining = await bucketDriver.readObject(shardPath)
    expect(Array.isArray(remaining)).toBe(true)
    expect((remaining as Item[]).map(x => x.id)).toEqual(['aa1'])
    // And the delete path was not taken for this shard
    expect(bucketDriver.deletedPaths.includes(shardPath)).toBe(false)
  })

  it('covers edge cases in index management', async () => {
    const a: Item = { id: 'aa1', status: 'new' }
    const b: Item = { id: 'bb2', status: 'new' }

    await adapter.insert([a, b])
    await adapter.createIndex('status')

    // Test the successful bucket removal path
    await adapter.remove([a])

    const index = await adapter.readIndex('status')
    expect(index.get('new')).toEqual(new Set(['bb2']))
  })
})
