import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import createFilesystemAdapter from '../src/index'

interface Item extends Record<string, unknown> {
  id: any,
  name: string,
}

const temporaryRoot = () => mkdtemp(path.join(tmpdir(), 'signaldb-fs-'))

describe('filesystem storage adapter', () => {
  const cleanupPaths: string[] = []
  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it('performs CRUD operations and sanitizes file paths', async () => {
    const folder = await temporaryRoot()
    cleanupPaths.push(folder)
    const adapter = createFilesystemAdapter<Item, any>(folder)
    await adapter.setup()

    const weirdId = 'CON<>bad::name '
    await adapter.insert([
      { id: weirdId, name: 'alpha' },
      { id: { nested: 'id' }, name: 'beta' },
    ])
    const itemsDirectory = path.join(folder, 'items')
    const shardEntries = await readdir(itemsDirectory)
    expect(shardEntries.every(entry => !/[<>:"/\\|?*]/.test(entry))).toBe(true)

    let items = await adapter.readAll()
    expect(items.map(item => item.name).toSorted()).toEqual(['alpha', 'beta'])

    await adapter.createIndex('name')
    const index = await adapter.readIndex('name')
    expect(index.get('alpha')).toEqual(new Set([weirdId]))
    expect(index.get('beta')).toEqual(new Set([{ nested: 'id' } as any]))

    await adapter.replace([
      { id: weirdId, name: 'alpha-updated' },
    ])
    items = await adapter.readAll()
    expect(items.find(item => item.id === weirdId)?.name).toBe('alpha-updated')

    await adapter.remove([{ id: weirdId, name: 'alpha-updated' }])
    items = await adapter.readAll()
    expect(items).toHaveLength(1)

    await adapter.removeAll()
    expect(await adapter.readAll()).toEqual([])

    await adapter.teardown()
  })
})
