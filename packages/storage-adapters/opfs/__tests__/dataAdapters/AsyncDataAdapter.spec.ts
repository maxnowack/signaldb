// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Collection, AsyncDataAdapter } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
import createOPFSAdapter from '../../src'
import { waitForLocalInsert } from '../../../__tests__/dataAdapters/waitForLocalInsert'

type Item = { id: string, name: string }

const fileContents: Record<string, string | null> = {}
const directories = new Set<string>([''])
const locks = new Map<string, Promise<void>>()
const failWritePaths = new Set<string>()
const abortedPaths: string[] = []
const norm = (p: string) => p.replaceAll(/\\+/g, '/').replace(/\/\/+/, '/').replace(/^\/$/, '')
const joinPath = (base: string, name: string) => norm([base, name].filter(Boolean).join('/'))
const hasAnyFileWithPrefix = (prefix: string) => Object.keys(fileContents)
  .some(k => k.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))

/**
 * @param basePath Base path for the directory handle.
 * @returns Directory handle mock.
 */
function makeDirectory(basePath: string) {
  return {
    async getDirectoryHandle(dirname: string, options?: { create: boolean }) {
      const newBase = joinPath(basePath, dirname)
      if (options?.create) {
        const parts = newBase.split('/').filter(Boolean)
        for (let i = 0; i <= parts.length; i += 1) {
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
        for (let i = 0; i < parts.length; i += 1) {
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
                const encoded = data.data as Uint8Array | undefined
                buffer = encoded ? new TextDecoder().decode(encoded) : ''
              }
            },
            async truncate() {
              // no-op for this mock
            },
            async close() {
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
    async removeEntry(name: string, options?: { recursive: boolean }) {
      const full = joinPath(basePath, name)
      if (options?.recursive) {
        const keys = Object.keys(fileContents).filter(k => k === full || k.startsWith(`${full}/`))
        keys.forEach(k => delete fileContents[k])
        for (const d of directories) {
          if (d === full || d.startsWith(`${full}/`)) directories.delete(d)
        }
        return
      }
      delete fileContents[full]
      directories.delete(full)
    },
    async* values() {
      const entries = new Set<string>()
      const prefix = basePath ? `${basePath}/` : ''

      for (const file of Object.keys(fileContents)) {
        if (file.startsWith(prefix)) {
          const relative = file.slice(prefix.length)
          const parts = relative.split('/').filter(Boolean)
          if (parts.length > 0) entries.add(parts[0])
        }
      }

      for (const directory of directories) {
        if (directory.startsWith(prefix) && directory !== basePath) {
          const relative = directory.slice(prefix.length)
          const parts = relative.split('/').filter(Boolean)
          if (parts.length > 0) entries.add(parts[0])
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
    request: async (name: string, _options: { mode: 'exclusive' }, callback: () => Promise<any>) => {
      const current = locks.get(name) || Promise.resolve()
      const next = current.then(callback)
      locks.set(name, next.then(() => {}, () => {}))
      return next
    },
  },
  configurable: true,
})

beforeEach(() => {
  for (const key of Object.keys(fileContents)) delete fileContents[key]
  directories.clear()
  directories.add('')
  failWritePaths.clear()
  abortedPaths.length = 0
  locks.clear()
})

type StorageFactory = (name: string) => ReturnType<typeof createOPFSAdapter<Item, string>>

/**
 * @param prefix Prefix for the generated name.
 * @returns Randomized name.
 */
function randomName(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 1e12).toString(16)}`
}

/**
 * @returns Storage adapter factory for the test.
 */
function createStorageFactory(): StorageFactory {
  return (name: string) => createOPFSAdapter<Item, string>(`${name}-${randomName('opfs')}`)
}

describe('opfs storage adapter + AsyncDataAdapter', () => {
  it('supports basic collection CRUD', async () => {
    const storage = createStorageFactory()
    const adapter = new AsyncDataAdapter({ storage })
    const collection = new Collection<Item, string>('items', adapter)

    await collection.ready()
    await collection.insert({ id: '1', name: 'Ada' })
    await collection.insert({ id: '2', name: 'Bob' })

    const items = await collection.find({}, { async: true }).fetch()
    expect(items.map(item => item.name).toSorted()).toEqual(['Ada', 'Bob'])

    await collection.dispose()
  })

  it('syncs with SyncManager using the same data/storage', async () => {
    const storage = createStorageFactory()
    const adapter = new AsyncDataAdapter({ storage })
    const syncId = `sync-${Math.floor(Math.random() * 1e12).toString(16)}`
    const remoteItem: Item = { id: '1', name: 'Remote' }
    const localItem: Item = { id: '2', name: 'Local' }
    let pullCalls = 0

    const pull = vi.fn(async (
      _collectionOptions: { name: string },
      _pullParameters: { lastFinishedSyncStart?: number, lastFinishedSyncEnd?: number },
    ): Promise<{ items: Item[] }> => {
      void _collectionOptions
      void _pullParameters
      pullCalls += 1
      if (pullCalls <= 2) return { items: [remoteItem] }
      return { items: [remoteItem, localItem] }
    })
    const push = vi.fn(async (
      _collectionOptions: { name: string },
      _pushParameters: { rawChanges: any[], changes: any },
    ): Promise<void> => {
      void _collectionOptions
      void _pushParameters
    })

    const syncManager = new SyncManager<Record<string, unknown>, Item, string>({
      id: syncId,
      dataAdapter: adapter,
      pull,
      push,
      autostart: false,
    })

    const collection = new Collection<Item, string>('items', adapter)
    syncManager.addCollection(collection, { name: 'items' })

    await collection.ready()
    await syncManager.sync('items')

    expect(pull).toHaveBeenCalled()
    expect(pull.mock.calls[0]?.[0]).toEqual({ name: 'items' })

    let items = await collection.find({}, { async: true }).fetch()
    expect(items).toEqual([remoteItem])

    await collection.insert(localItem)
    await waitForLocalInsert(syncManager, 'items', localItem.id)
    await syncManager.sync('items')

    expect(push).toHaveBeenCalledTimes(1)
    const pushArguments = push.mock.calls[0]
    expect(pushArguments?.[0]).toEqual({ name: 'items' })
    expect(pushArguments?.[1]?.changes?.added).toEqual([localItem])
    expect(pushArguments?.[1]?.changes?.modified).toEqual([])
    expect(pushArguments?.[1]?.changes?.removed).toEqual([])
    expect(pushArguments?.[1]?.rawChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'insert', data: localItem }),
      ]),
    )

    items = await collection.find({}, { async: true }).fetch()
    expect(items.map(item => item.name).toSorted()).toEqual(['Local', 'Remote'])

    await syncManager.dispose()
    await collection.dispose()
  })
})
