import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Changeset } from '@signaldb/core'
import type {
  IpcRendererLike,
  ContextBridgeLike,
  WebContentsLike,
  ChangePayload,
  SignalDBBridge,
  CollectionLike,
} from '../src/types'
import {
  SIGNALDB_LOAD,
  SIGNALDB_SAVE,
  SIGNALDB_REGISTER,
  SIGNALDB_UNREGISTER,
  SIGNALDB_CHANGE,
} from '../src/types'
import { setupSignalDBMain } from '../src/main'
import { setupSignalDBPreload } from '../src/preload'
import { createElectronAdapter } from '../src/renderer'

type Handler = (event: any, ...arguments_: any[]) => any

/**
 * @returns A mock ipcMain with accessible handlers map
 */
function createMockIpcMain() {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    handle(channel: string, listener: Handler) {
      handlers.set(channel, listener)
    },
    removeHandler(channel: string) {
      handlers.delete(channel)
    },
  }
}

/**
 * @returns A mock WebContents with test helpers
 */
function createMockWebContents(): WebContentsLike & {
  _destroyed: boolean,
  _destroyCallbacks: Array<() => void>,
  _sent: Array<{ channel: string, arguments: any[] }>,
  destroy(): void,
} {
  const wc: WebContentsLike & {
    _destroyed: boolean,
    _destroyCallbacks: Array<() => void>,
    _sent: Array<{ channel: string, arguments: any[] }>,
    destroy(): void,
  } = {
    _destroyed: false,
    _destroyCallbacks: [],
    _sent: [],
    send(channel: string, ...arguments_: any[]) {
      wc._sent.push({ channel, arguments: arguments_ })
    },
    isDestroyed() {
      return wc._destroyed
    },
    once(event: 'destroyed', listener: () => void) {
      wc._destroyCallbacks.push(listener)
    },
    destroy() {
      wc._destroyed = true
      for (const callback of wc._destroyCallbacks) callback()
      wc._destroyCallbacks = []
    },
  }
  return wc
}

type Listener = (...arguments_: any[]) => void

/**
 * @param items - Initial items in the collection
 * @returns A mock Collection with test helpers
 */
function createMockCollection(
  items: any[] = [{ id: '1', name: 'test' }],
): CollectionLike & {
  _items: any[],
  _listeners: Map<string, Listener[]>,
} {
  const _items = [...items]
  const _listeners = new Map<string, Listener[]>()

  return {
    _items,
    _listeners,
    find() {
      return {
        fetch: () => [..._items],
      }
    },
    insert: vi.fn((item: any) => {
      _items.push(item)
      return item.id
    }),
    updateOne: vi.fn((selector: any, modifier: any) => {
      const index = _items.findIndex(
        (i: any) => i.id === selector.id,
      )
      if (index !== -1) {
        Object.assign(_items[index], modifier.$set)
      }
    }),
    removeOne: vi.fn((selector: any) => {
      const index = _items.findIndex(
        (i: any) => i.id === selector.id,
      )
      if (index !== -1) _items.splice(index, 1)
    }),
    batch(callback: () => void) {
      callback()
    },
    on(event: string, listener: Listener) {
      const array = _listeners.get(event) || []
      array.push(listener)
      _listeners.set(event, array)
    },
    off(event: string, listener: Listener) {
      const array = _listeners.get(event) || []
      _listeners.set(event, array.filter(l => l !== listener))
    },
  }
}

describe('setupSignalDBMain', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let collection: ReturnType<typeof createMockCollection>

  beforeEach(() => {
    ipcMain = createMockIpcMain()
    collection = createMockCollection()
  })

  it('should register handlers for all channels', () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    expect(ipcMain.handlers.has(SIGNALDB_LOAD)).toBe(true)
    expect(ipcMain.handlers.has(SIGNALDB_SAVE)).toBe(true)
    expect(ipcMain.handlers.has(SIGNALDB_REGISTER)).toBe(true)
    expect(ipcMain.handlers.has(SIGNALDB_UNREGISTER)).toBe(true)
  })

  it('should load items from the collection', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const handler = ipcMain.handlers.get(SIGNALDB_LOAD)
    const wc = createMockWebContents()
    const result = await handler?.(
      { sender: wc },
      { collectionName: 'posts' },
    )

    expect(result).toEqual({ items: [{ id: '1', name: 'test' }] })
  })

  it('should apply changeset to collection on save', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const handler = ipcMain.handlers.get(SIGNALDB_SAVE)
    const wc = createMockWebContents()
    const changes: Changeset<any> = {
      added: [{ id: '2', name: 'new' }],
      modified: [{ id: '1', name: 'updated' }],
      removed: [],
    }
    await handler?.(
      { sender: wc },
      { collectionName: 'posts', items: [], changes },
    )

    expect(collection.insert).toHaveBeenCalledWith(
      { id: '2', name: 'new' },
    )
    expect(collection.updateOne).toHaveBeenCalledWith(
      { id: '1' },
      { $set: { id: '1', name: 'updated' } },
    )
  })

  it('should remove items from collection on save', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const handler = ipcMain.handlers.get(SIGNALDB_SAVE)
    const wc = createMockWebContents()
    const changes: Changeset<any> = {
      added: [],
      modified: [],
      removed: [{ id: '1', name: 'test' }],
    }
    await handler?.(
      { sender: wc },
      { collectionName: 'posts', items: [], changes },
    )

    expect(collection.removeOne).toHaveBeenCalledWith({ id: '1' })
  })

  it('should throw on unknown collection name', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const handler = ipcMain.handlers.get(SIGNALDB_LOAD)
    const wc = createMockWebContents()
    await expect(
      handler?.({ sender: wc }, { collectionName: 'unknown' }),
    ).rejects.toThrow(
      '@signaldb/electron: unknown collection "unknown"',
    )
  })

  it('should notify subscribers when collection data changes', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const wc = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    await registerHandler?.(
      { sender: wc },
      { collectionName: 'posts' },
    )

    expect(collection._listeners.get('added')?.length).toBe(1)
    expect(collection._listeners.get('changed')?.length).toBe(1)
    expect(collection._listeners.get('removed')?.length).toBe(1)

    const addedListeners = collection._listeners.get('added') ?? []
    addedListeners[0]({ id: '2', name: 'new' })

    expect(wc._sent).toHaveLength(1)
    expect(wc._sent[0].channel).toBe(SIGNALDB_CHANGE)
    expect(wc._sent[0].arguments[0].collectionName).toBe('posts')
    expect(wc._sent[0].arguments[0].data.items).toEqual(
      [{ id: '1', name: 'test' }],
    )
  })

  it('should fan out changes to multiple windows', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const wc1 = createMockWebContents()
    const wc2 = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    await registerHandler?.(
      { sender: wc1 },
      { collectionName: 'posts' },
    )
    await registerHandler?.(
      { sender: wc2 },
      { collectionName: 'posts' },
    )

    expect(collection._listeners.get('added')?.length).toBe(1)

    const addedListeners = collection._listeners.get('added') ?? []
    addedListeners[0]({ id: '2' })

    expect(wc1._sent).toHaveLength(1)
    expect(wc2._sent).toHaveLength(1)
  })

  it('should auto-cleanup destroyed WebContents and remove listeners', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const wc = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    await registerHandler?.(
      { sender: wc },
      { collectionName: 'posts' },
    )

    expect(collection._listeners.get('added')?.length).toBe(1)

    wc.destroy()

    expect(collection._listeners.get('added')?.length).toBe(0)
  })

  it('should not send to destroyed WebContents', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const wc1 = createMockWebContents()
    const wc2 = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    await registerHandler?.(
      { sender: wc1 },
      { collectionName: 'posts' },
    )
    await registerHandler?.(
      { sender: wc2 },
      { collectionName: 'posts' },
    )

    wc1._destroyed = true

    const addedListeners = collection._listeners.get('added') ?? []
    addedListeners[0]({ id: '2' })

    expect(wc1._sent).toHaveLength(0)
    expect(wc2._sent).toHaveLength(1)
  })

  it('should remove listeners when last subscriber leaves via unregister', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const wc = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    const unregisterHandler = ipcMain.handlers.get(
      SIGNALDB_UNREGISTER,
    )

    await registerHandler?.(
      { sender: wc },
      { collectionName: 'posts' },
    )
    expect(collection._listeners.get('added')?.length).toBe(1)

    await unregisterHandler?.(
      { sender: wc },
      { collectionName: 'posts' },
    )
    expect(collection._listeners.get('added')?.length).toBe(0)
  })

  it('should re-attach listeners after all subscribers leave and new one arrives', async () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const wc1 = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    const unregisterHandler = ipcMain.handlers.get(
      SIGNALDB_UNREGISTER,
    )

    await registerHandler?.(
      { sender: wc1 },
      { collectionName: 'posts' },
    )
    await unregisterHandler?.(
      { sender: wc1 },
      { collectionName: 'posts' },
    )

    expect(collection._listeners.get('added')?.length).toBe(0)

    const wc2 = createMockWebContents()
    await registerHandler?.(
      { sender: wc2 },
      { collectionName: 'posts' },
    )

    expect(collection._listeners.get('added')?.length).toBe(1)
  })

  it('should clean up everything on dispose', async () => {
    const result = setupSignalDBMain(ipcMain)
    result.addCollection(collection, { name: 'posts' })

    const wc = createMockWebContents()
    const registerHandler = ipcMain.handlers.get(SIGNALDB_REGISTER)
    await registerHandler?.(
      { sender: wc },
      { collectionName: 'posts' },
    )

    result.dispose()

    expect(ipcMain.handlers.size).toBe(0)
    expect(collection._listeners.get('added')?.length).toBe(0)
  })

  it('should allow direct collection access in main process', () => {
    const signalDB = setupSignalDBMain(ipcMain)
    signalDB.addCollection(collection, { name: 'posts' })

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'test' }])

    collection.insert({ id: '2', name: 'direct' })
    expect(collection.find().fetch()).toContainEqual(
      { id: '2', name: 'direct' },
    )
  })
})

describe('setupSignalDBPreload', () => {
  it('should expose signaldb bridge on contextBridge', () => {
    const listeners = new Map<string, ((...arguments_: any[]) => void)[]>()
    const ipcRenderer: IpcRendererLike = {
      invoke: vi.fn(async () => {}),
      on(
        channel: string,
        listener: (...arguments_: any[]) => void,
      ) {
        const array = listeners.get(channel) || []
        array.push(listener)
        listeners.set(channel, array)
      },
      removeListener(
        channel: string,
        listener: (...arguments_: any[]) => void,
      ) {
        const array = listeners.get(channel) || []
        listeners.set(
          channel,
          array.filter(l => l !== listener),
        )
      },
    }

    let exposedApi: any
    const contextBridge: ContextBridgeLike = {
      exposeInMainWorld(
        apiKey: string,
        api: Record<string, any>,
      ) {
        exposedApi = { apiKey, api }
      },
    }

    setupSignalDBPreload(ipcRenderer, contextBridge)

    expect(exposedApi.apiKey).toBe('signaldb')
    expect(exposedApi.api).toHaveProperty('load')
    expect(exposedApi.api).toHaveProperty('save')
    expect(exposedApi.api).toHaveProperty('register')
    expect(exposedApi.api).toHaveProperty('unregister')
    expect(exposedApi.api).toHaveProperty('onChange')
  })

  it('should invoke correct IPC channels', async () => {
    const ipcRenderer: IpcRendererLike = {
      invoke: vi.fn(async () => ({ items: [] })),
      on: vi.fn(),
      removeListener: vi.fn(),
    }

    let bridge: SignalDBBridge | undefined
    const contextBridge: ContextBridgeLike = {
      exposeInMainWorld(_apiKey: string, api: any) {
        bridge = api as SignalDBBridge
      },
    }

    setupSignalDBPreload(ipcRenderer, contextBridge)

    await bridge?.load('posts')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      SIGNALDB_LOAD,
      { collectionName: 'posts' },
    )

    await bridge?.save(
      'posts',
      [{ id: '1' }],
      { added: [], modified: [], removed: [] },
    )
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      SIGNALDB_SAVE,
      {
        collectionName: 'posts',
        items: [{ id: '1' }],
        changes: { added: [], modified: [], removed: [] },
      },
    )

    await bridge?.register('posts')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      SIGNALDB_REGISTER,
      { collectionName: 'posts' },
    )

    await bridge?.unregister('posts')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      SIGNALDB_UNREGISTER,
      { collectionName: 'posts' },
    )
  })

  it('should handle onChange with cleanup', () => {
    const listeners: Array<{
      channel: string,
      listener: (...arguments_: any[]) => void,
    }> = []
    const ipcRenderer: IpcRendererLike = {
      invoke: vi.fn(async () => {}),
      on(
        channel: string,
        listener: (...arguments_: any[]) => void,
      ) {
        listeners.push({ channel, listener })
      },
      removeListener: vi.fn(),
    }

    let bridge: SignalDBBridge | undefined
    const contextBridge: ContextBridgeLike = {
      exposeInMainWorld(_apiKey: string, api: any) {
        bridge = api as SignalDBBridge
      },
    }

    setupSignalDBPreload(ipcRenderer, contextBridge)

    const callback = vi.fn()
    const cleanup = bridge?.onChange(callback)

    expect(listeners).toHaveLength(1)
    expect(listeners[0].channel).toBe(SIGNALDB_CHANGE)

    const payload: ChangePayload<any> = {
      collectionName: 'posts',
      data: { items: [] },
    }
    listeners[0].listener({}, payload)
    expect(callback).toHaveBeenCalledWith(payload)

    cleanup?.()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      SIGNALDB_CHANGE,
      expect.any(Function),
    )
  })
})

describe('createElectronAdapter', () => {
  let mockBridge: SignalDBBridge
  let onChangeCallbacks: Array<
    (payload: ChangePayload<any>) => void
  >

  beforeEach(() => {
    onChangeCallbacks = []
    mockBridge = {
      load: vi.fn(async () => (
        { items: [{ id: '1', name: 'test' }] }
      )),
      save: vi.fn(async () => {}),
      register: vi.fn(async () => {}),
      unregister: vi.fn(async () => {}),
      onChange: vi.fn(
        (callback: (payload: ChangePayload<any>) => void) => {
          onChangeCallbacks.push(callback)
          return () => {
            const index = onChangeCallbacks.indexOf(callback)
            if (index !== -1) onChangeCallbacks.splice(index, 1)
          }
        },
      ),
    }
    ;(globalThis as any).signaldb = mockBridge
  })

  it('should delegate load to bridge', async () => {
    const adapter = createElectronAdapter('posts')
    const result = await adapter.load()

    expect(mockBridge.load).toHaveBeenCalledWith('posts')
    expect(result).toEqual(
      { items: [{ id: '1', name: 'test' }] },
    )
  })

  it('should delegate save to bridge', async () => {
    const adapter = createElectronAdapter('posts')
    const items = [{ id: '1', name: 'updated' }]
    const changes = {
      added: [] as typeof items,
      modified: [] as typeof items,
      removed: [] as typeof items,
    }
    await adapter.save(items, changes)

    expect(mockBridge.save).toHaveBeenCalledWith(
      'posts',
      items,
      changes,
    )
  })

  it('should register onChange and filter by collectionName', async () => {
    const adapter = createElectronAdapter('posts')
    const onChange = vi.fn()
    await adapter.register(onChange)

    expect(mockBridge.onChange).toHaveBeenCalled()
    expect(mockBridge.register).toHaveBeenCalledWith('posts')

    onChangeCallbacks[0]({
      collectionName: 'posts',
      data: { items: [{ id: '2' }] },
    })
    expect(onChange).toHaveBeenCalledWith(
      { items: [{ id: '2' }] },
    )

    onChange.mockClear()
    onChangeCallbacks[0]({
      collectionName: 'users',
      data: { items: [] },
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('should clean up on unregister', async () => {
    const adapter = createElectronAdapter('posts')
    const onChange = vi.fn()
    await adapter.register(onChange)

    expect(onChangeCallbacks).toHaveLength(1)

    await adapter.unregister?.()

    expect(onChangeCallbacks).toHaveLength(0)
    expect(mockBridge.unregister).toHaveBeenCalledWith('posts')
  })

  it('should throw if globalThis.signaldb is not available', async () => {
    ;(globalThis as any).signaldb = undefined

    const adapter = createElectronAdapter('posts')
    await expect(
      adapter.load(),
    ).rejects.toThrow('window.signaldb is not available')
  })
})
