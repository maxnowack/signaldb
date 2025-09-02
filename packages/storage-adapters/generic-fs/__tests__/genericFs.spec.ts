/* eslint-disable unicorn/no-useless-spread */
import { describe, it, expect } from 'vitest'
import createGenericFSAdapter, { type Driver } from '../src'

type Item = { id: string, name?: string, tag?: string }

class MemoryDriver implements Driver<Item, string> {
  private files = new Map<string, any>()
  private dirs = new Set<string>()

  async fileNameForId(id: string) {
    return `${id}.json`
  }

  async fileNameForIndexKey(key: string) {
    return `${key}.idx.json`
  }

  async joinPath(...parts: string[]) {
    return parts.join('/')
  }

  async ensureDir(path: string) {
    this.dirs.add(path)
  }

  async fileExists(path: string) {
    return this.dirs.has(path) || this.files.has(path)
  }

  async readObject(path: string) {
    return this.files.get(path) ?? null
  }

  async writeObject(path: string, value: Item[]) {
    this.files.set(path, value)
  }

  async readIndexObject(path: string) {
    return this.files.get(path) ?? null
  }

  async writeIndexObject(path: string, value: Record<string, string[]>[]) {
    this.files.set(path, value)
  }

  async listFilesRecursive(directoryPath: string) {
    const prefix = directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`
    const out: string[] = []
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        out.push(key.slice(prefix.length))
      }
    }
    return out
  }

  async removeEntry(path: string, options?: { recursive?: boolean }) {
    if (options?.recursive) {
      // delete all files under prefix
      const keys = [...this.files.keys()]
        .filter(k => k.startsWith(`${path}/`) || k === path)
      keys.forEach(k => this.files.delete(k))
      // delete dirs under prefix
      for (const d of [...this.dirs]) {
        if (d.startsWith(`${path}/`) || d === path) this.dirs.delete(d)
      }
      return
    }
    this.files.delete(path)
    this.dirs.delete(path)
  }
}

describe('generic-fs adapter', () => {
  it('covers setup, CRUD, index create/read/drop and removeAll', async () => {
    const driver = new MemoryDriver()
    const adapter = createGenericFSAdapter<Item, string>(driver, 'db')

    await adapter.setup()
    // ensure items dir exists for readAll
    await (driver as any).ensureDir('db/items')

    // create index first to maintain it
    await adapter.createIndex('name')

    // insert a couple of items
    await adapter.insert([
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ])

    // readAll and readIds
    const all = await adapter.readAll()
    expect(all.map(i => i.id).sort()).toEqual(['1', '2'])
    const byIds = await adapter.readIds(['2'])
    expect(byIds).toEqual([{ id: '2', name: 'b' }])

    // replace one
    await adapter.replace([{ id: '2', name: 'bb' }])
    const afterReplace = await adapter.readIds(['2'])
    expect(afterReplace).toEqual([{ id: '2', name: 'bb' }])

    // read index
    const index = await adapter.readIndex('name')
    expect(index.get('a')).toBeDefined()
    expect(index.get('bb')).toBeDefined()

    // drop index and ensure it is gone
    await adapter.dropIndex('name')
    await expect(adapter.readIndex('name')).rejects.toThrow('does not exist')

    // remove one item and ensure delta applied
    await adapter.createIndex('name')
    await adapter.remove([{ id: '1', name: 'a' }])
    const index2 = await adapter.readIndex('name')
    expect(index2.get('a')).toBeUndefined()

    // removeAll clears everything
    await adapter.removeAll()
    expect(await adapter.readAll()).toEqual([])
  })
})
