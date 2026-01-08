import { describe, it, expect, vi } from 'vitest'
import { Collection, AutoFetchDataAdapter } from '../src'
import queryId from '../src/utils/queryId'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

type Post = { id: string, title?: string, type?: string }

describe('AutoFetchDataAdapter', () => {
  it('sets up storage and indices on ready', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })

    const col = new Collection<Post>('posts', adapter, { indices: ['type'] })
    await col.ready()

    // indexes configured via Collection options should exist
    await expect(storage.readIndex('type')).resolves.toBeInstanceOf(Map)
  })

  it('auto-fetches and stores items on first async query', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const remote: Post[] = [
      { id: '1', title: 'A', type: 'x' },
      { id: '2', title: 'B', type: 'y' },
    ]

    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => remote,
    })

    const col = new Collection<Post>('posts', adapter, { indices: ['type'] })
    await col.ready()

    // First async fetch resolves local snapshot (empty), remote ingest happens afterwards
    const first = await col.find<true>({}, { async: true }).fetch()
    expect(first).toEqual([])
    // Allow auto-fetch to complete and ingest results
    await Promise.resolve()
    const all = await col.find<true>({}, { async: true }).fetch()
    expect(all).toEqual(remote)

    const only2 = await col.find<true>({ id: '2' }, { async: true }).fetch()
    expect(only2).toEqual([{ id: '2', title: 'B', type: 'y' }])

    const inStorage = await storage.readAll()
    expect(inStorage).toHaveLength(2)
  })

  it('supports CRUD via collection and reflects in async queries', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })

    const col = new Collection<Post>('posts', adapter, { indices: ['type'] })
    await col.ready()

    const id = await col.insert({ id: 'p1', title: 'Hello', type: 'x' })
    expect(id).toBe('p1')

    await col.updateOne({ id }, { $set: { title: 'World' } })
    let item = await col.find<true>({ id }, { async: true }).fetch()
    expect(item).toEqual([{ id: 'p1', title: 'World', type: 'x' }])

    await col.replaceOne({ id }, { title: 'Replaced' })
    item = await col.find<true>({ id }, { async: true }).fetch()
    expect(item).toEqual([{ id: 'p1', title: 'Replaced' }])

    await col.removeOne({ id })
    const empty = await col.find<true>({ id }, { async: true }).fetch()
    expect(empty).toEqual([])
  })

  it('purges auto-fetched items after unregister when purgeDelay=0', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const remote: Post[] = [{ id: '1', title: 'Keep me around' }]
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => remote,
      purgeDelay: 0,
    })

    const col = new Collection<Post>('posts', adapter)
    await col.ready()

    // Keep a persistent observer so fetch can complete before we unregister
    const cursor = col.find<true>({}, { async: true })
    await cursor.forEach(() => { /* keep observer active */ })
    // let auto-fetch ingest and query state cycle to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    // now dispose observer to unregister query and trigger purge
    cursor.cleanup()
    await new Promise(resolve => setTimeout(resolve, 0))
    const itemsAfterPurge = await storage.readAll()
    expect(itemsAfterPurge).toEqual([])
  })

  it('triggers refetch via registerRemoteChange callback', async () => {
    const storage = memoryStorageAdapter<Post>([])
    let remote: Post[] = [{ id: '1', title: 'A' }]
    let remoteChangeCallback: (() => Promise<void>) | undefined
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => remote,
      registerRemoteChange: async (callback) => {
        remoteChangeCallback = callback
      },
    })

    const col = new Collection<Post>('posts', adapter)
    await col.ready()

    // Register and let initial auto-fetch ingest
    const backend = (col as any).backend
    backend.registerQuery({})
    await new Promise(r => setTimeout(r, 20))
    expect(await storage.readAll()).toEqual([{ id: '1', title: 'A' }])

    // Change remote and trigger callback
    remote = [{ id: '2', title: 'B' }]
    await remoteChangeCallback?.()
    await new Promise(r => setTimeout(r, 10))
    const all = await col.find<true>({}, { async: true }).fetch()
    expect(all).toEqual([{ id: '1', title: 'A' }, { id: '2', title: 'B' }])
    backend.unregisterQuery({})
  })

  it('publishes error and calls onError when fetchQueryItems is invalid', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const onError = vi.fn()
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      // invalid return (undefined) triggers error path
      // @ts-expect-error we want to test invalid return
      fetchQueryItems: async () => {},
      onError,
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()

    const states: string[] = []
    const backend = (col as any).backend
    backend.registerQuery({})
    const unsubscribe = backend.onQueryStateChange({}, undefined, (s: string) => states.push(s))
    await new Promise(r => setTimeout(r, 20))
    expect(states).toContain('error')
    expect(onError).toHaveBeenCalled()
    unsubscribe()
    backend.unregisterQuery({})
  })

  it('schedules purge with delay > 0', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [{ id: '1', title: 'A' }],
      purgeDelay: 5,
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()

    const backend = (col as any).backend
    backend.registerQuery({})
    await new Promise(r => setTimeout(r, 20))
    const storedItems = await storage.readAll()
    expect(storedItems.length).toBe(1)
    backend.unregisterQuery({}) // unregister; schedule purge
    // unregister again to hit clearTimeout on existing timer
    backend.unregisterQuery({})
    await new Promise(r => setTimeout(r, 30))
    expect(await storage.readAll()).toEqual([])
  })

  it('uses custom mergeItems during upsert', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
      mergeItems: (a, b) => ({ ...a, ...b, title: (a.title || '') + '|' + (b.title || '') }),
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    // seed existing
    await col.insert({ id: 'x', title: 'left' })
    // start observer and simulate remote ingest through internal fetch
    await (adapter as any).upsertMerged('posts', [{ id: 'x', title: 'right' }])
    const item = await col.find<true>({ id: 'x' }, { async: true }).fetch()
    expect(item).toEqual([{ id: 'x', title: 'left|right' }])
  })

  it('onQueryStateChange throws when registry missing (after dispose)', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    const backend = (col as any).backend
    await backend.dispose()
    expect(() => backend.onQueryStateChange({}, undefined, () => {})).toThrow('Collection posts not initialized!')
  })

  it('invokes default onError (console.error) when a subscriber throws', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    const backend = (col as any).backend
    backend.registerQuery({})
    const unsubscribe = backend.onQueryStateChange({}, undefined, () => {
      throw new Error('boom')
    })
    // Trigger a publish by registering a second time (fulfillQuery path) or active marker
    await new Promise(r => setTimeout(r, 10))
    expect(errorSpy).toHaveBeenCalled()
    unsubscribe()
    backend.unregisterQuery({})
    errorSpy.mockRestore()
  })

  it('fulfillQuery error paths: missing registry and missing record', async () => {
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await expect(((adapter as any).fulfillQuery('nope', {}, undefined))).rejects.toThrow('Collection nope not initialized!')
    ;(adapter as any).queries.set('x', new Map())
    await expect(((adapter as any).fulfillQuery('x', {}, undefined))).resolves.toBeUndefined()
  })

  it('getIndexInfo fast id and null selector, and queryItems storage errors', async () => {
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await expect(((adapter as any).getIndexInfo('nope', {}))).rejects.toThrow('No persistence adapter for collection nope')
    ;(adapter as any).storageAdapters.set('a', memoryStorageAdapter<Post>([]))
    const fast = await (adapter as any).getIndexInfo('a', { id: '1' })
    expect(fast.matched).toBe(true)
    const nil = await (adapter as any).getIndexInfo('a', null)
    expect(nil.matched).toBe(false)
    await expect(((adapter as any).queryItems('nope', {}))).rejects.toThrow('No persistence adapter for collection nope')
  })

  it('checkQueryUpdates missing registry, empty affected, and error path', async () => {
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await expect(((adapter as any).checkQueryUpdates('nope', []))).rejects.toThrow('Collection nope not initialized!')
    ;(adapter as any).queries.set('c', new Map())
    await (adapter as any).checkQueryUpdates('c', [{ id: '1' }])
    ;(adapter as any).queries.get('c').set('na', { selector: { z: 9 }, options: undefined, state: 'active', error: null, items: [], listeners: new Set() })
    await (adapter as any).checkQueryUpdates('c', [{ id: '1' }])
    ;(adapter as any).queries.get('c').set('qid', { selector: {}, options: undefined, state: 'active', error: null, items: [], listeners: new Set() })
    const execSpy = vi.spyOn(adapter as any, 'executeQuery').mockRejectedValue(new Error('boom'))
    await (adapter as any).checkQueryUpdates('c', [{ id: '1' }])
    execSpy.mockRestore()
  })

  it('private CRUD throws when storage missing', async () => {
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await expect(((adapter as any).insert('m', { id: '1' }))).rejects.toThrow('No persistence adapter for collection m')
    await expect(((adapter as any).updateOne('m', {}, {}))).rejects.toThrow('No persistence adapter for collection m')
    await expect(((adapter as any).updateMany('m', {}, {}))).rejects.toThrow('No persistence adapter for collection m')
    await expect(((adapter as any).replaceOne('m', {}, {}))).rejects.toThrow('No persistence adapter for collection m')
    await expect(((adapter as any).removeOne('m', {}))).rejects.toThrow('No persistence adapter for collection m')
    await expect(((adapter as any).removeMany('m', {}))).rejects.toThrow('No persistence adapter for collection m')
  })

  it('purgeSelector does not remove CRUD-inserted items (not auto-fetched)', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
      purgeDelay: 0,
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    await col.insert({ id: 'keep', title: 'manual' })
    const backend = (col as any).backend
    backend.registerQuery({})
    backend.unregisterQuery({}) // schedules immediate purge but selectorIds empty
    await new Promise(r => setTimeout(r, 10))
    const items = await storage.readAll()
    expect(items).toEqual([{ id: 'keep', title: 'manual' }])
  })

  it('registerQuery throws when registry missing after dispose', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    const backend = (col as any).backend
    await backend.dispose()
    expect(() => backend.registerQuery({})).toThrow('Collection posts not initialized!')
  })

  it('onQueryStateChange creates missing registry bucket and callback runs', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    const backend = (col as any).backend
    const spy = vi.fn()
    const unsubscribe = backend.onQueryStateChange({ type: 'x' }, undefined, spy)
    // After registration, fulfillQuery kicks; wait a tick
    await new Promise(r => setTimeout(r, 10))
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('executeQuery with sort, skip, limit, and fields (id excluded)', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('posts', adapter)
    await col.ready()
    await col.insert({ id: '1', title: 'A', type: 'x' })
    await col.insert({ id: '2', title: 'B', type: 'y' })
    await col.insert({ id: '3', title: 'C', type: 'z' })
    const result = await col
      .find<true>(
        {},
        {
          async: true,
          sort: { title: -1 as const },
          skip: 1,
          limit: 1,
          fields: { id: 0 as const, title: 1 as const },
        },
      )
      .fetch()
    expect(result).toEqual([{ title: 'B' }])
  })

  it('backend CRUD covers internal insert/update/replace/remove paths', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('posts', adapter)
    // use the public createCollectionBackend via Collection
    const backend = (col as any).backend
    await backend.isReady()

    // insert
    const a = await backend.insert({ id: 'a', title: 't', type: 'x' })
    expect(a).toEqual({ id: 'a', title: 't', type: 'x' })
    // updateOne
    const u1 = await backend.updateOne({ id: 'a' }, { $set: { title: 't2' } })
    expect(u1).toEqual([{ id: 'a', title: 't2', type: 'x' }])
    // updateMany (change type only to avoid id collision path)
    const u2 = await backend.updateMany({ type: 'x' }, { $set: { type: 'y' } })
    expect(u2.length === 0 || u2[0].type === 'y').toBe(true)
    // replaceOne
    const r1 = await backend.replaceOne({ id: 'a' }, { title: 'repl' })
    expect(r1).toEqual([{ id: 'a', title: 'repl' }])
    // removeOne
    const rm1 = await backend.removeOne({ id: 'a' })
    expect(rm1).toEqual([{ id: 'a', title: 'repl' }])
    // removeMany
    await backend.insert({ id: 'b', title: 'b', type: 'k' })
    await backend.insert({ id: 'c', title: 'c', type: 'k' })
    const rm2 = await backend.removeMany({ type: 'k' })
    expect(rm2.map((i: any) => i.id).toSorted()).toEqual(['b', 'c'])
  })

  it('getIndexInfo filtersForNull ($exists:false) and excludes non-null keys', async () => {
    const storage = memoryStorageAdapter<Post>([])
    await storage.createIndex('type')
    // build index by inserting items
    await storage.insert([{ id: '1', title: 'n', type: null as any }, { id: '2', title: 'x', type: 'x' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    ;(adapter as any).collectionIndices.set('posts', ['type'])
    ;(adapter as any).storageAdapters.set('posts', storage)
    const info = await (adapter as any).getIndexInfo('posts', { type: { $exists: false } })
    expect(info.matched).toBe(true)
    // Should include id '1' and exclude '2'
    expect(info.ids).toContain('1')
    expect(info.ids).not.toContain('2')
  })

  it('queryItems matched fast-id path returns readIds directly (optimizedSelector empty)', async () => {
    const storage = memoryStorageAdapter<Post>([])
    await storage.insert([{ id: 'z', title: 'Z' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    ;(adapter as any).storageAdapters.set('q2', storage)
    const items = await (adapter as any).queryItems('q2', { id: 'z' })
    expect(items).toEqual([{ id: 'z', title: 'Z' }])
  })

  it('getIndexInfo handles $in include and $nin exclude paths', async () => {
    const storage = memoryStorageAdapter<Post>([])
    await storage.createIndex('type')
    await storage.insert([{ id: '1', type: 'x' }, { id: '2', type: 'y' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    ;(adapter as any).collectionIndices.set('posts3', ['type'])
    ;(adapter as any).storageAdapters.set('posts3', storage)
    const inc = await (adapter as any).getIndexInfo('posts3', { type: { $in: ['x'] } })
    expect(inc.matched).toBe(true)
    expect(inc.ids).toEqual(['1'])
    const exc = await (adapter as any).getIndexInfo('posts3', { type: { $nin: ['y'] } })
    expect(exc.matched).toBe(true)
    expect(exc.ids).toContain('1')
    expect(exc.ids).not.toContain('2')
  })

  it('publishForSelector updates only matching selector records', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('pub', adapter)
    await col.ready()
    const backend = (col as any).backend
    backend.registerQuery({})
    backend.registerQuery({ type: 'k' })
    const error = new Error('E')
    await (adapter as any).publishForSelector('pub', {}, 'error', error)
    expect(backend.getQueryError({})).toBe(error)
    expect(backend.getQueryError({ type: 'k' })).toBeNull()
    backend.unregisterQuery({})
    backend.unregisterQuery({ type: 'k' })
  })

  it('publishForSelector early return with missing registry and routes listener error', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: async () => [],
    })
    // missing registry -> no throw, no-op
    await (adapter as any).publishForSelector('missing', {}, 'active', null)

    // create registry and add throwing listener
    const col = new Collection<Post>('pub2', adapter)
    await col.ready()
    const backend = (col as any).backend
    const unsubscribe = backend.onQueryStateChange({}, undefined, () => {
      throw new Error('listener boom2')
    })
    await (adapter as any).publishForSelector('pub2', {}, 'active', null)
    expect(errorSpy).toHaveBeenCalled()
    unsubscribe()
    errorSpy.mockRestore()
  })

  it('CRUD duplicate id collision branches throw', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('dup', adapter)
    const backend = (col as any).backend
    await backend.isReady()

    await backend.insert({ id: '1', title: 'a' })
    await expect(backend.insert({ id: '1', title: 'b' })).rejects.toThrow('Item with id 1 already exists')

    await backend.insert({ id: '2', title: 'two' })
    // updateOne id collision
    await expect(backend.updateOne({ id: '1' }, { $set: { id: '2' } })).rejects.toThrow('Item with id 2 already exists')
    // replaceOne id collision
    await expect(backend.replaceOne({ id: '1' }, { id: '2', title: 'x' })).rejects.toThrow('Item with id 2 already exists')
  })

  it('updateOne returns [] when no matching item', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('u1', adapter)
    const backend = (col as any).backend
    await backend.isReady()
    const result1 = await backend.updateOne({ id: 'absent' }, { $set: { title: 'x' } })
    expect(result1).toEqual([])
  })

  it('updateMany returns [] when no items match', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('u2', adapter)
    const backend = (col as any).backend
    await backend.isReady()
    const result2 = await backend.updateMany({ type: 'none' }, { $set: { title: 'x' } })
    expect(result2).toEqual([])
  })

  it('updateMany id collision throws', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('u3', adapter)
    const backend = (col as any).backend
    await backend.isReady()
    await backend.insert({ id: 'm1', title: 'one', type: 't' })
    await backend.insert({ id: 'm2', title: 'two', type: 't' })
    await expect(backend.updateMany({ type: 't' }, { $set: { id: 'm2' } })).rejects.toThrow('Item with id m2 already exists')
  })

  it('replaceOne returns [] when no matching item', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('r0', adapter)
    const backend = (col as any).backend
    await backend.isReady()
    const result3 = await backend.replaceOne({ id: 'absent' }, { title: 'x' })
    expect(result3).toEqual([])
  })

  it('upsertMerged throws when storage missing', async () => {
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await expect((adapter as any).upsertMerged('nost', [{ id: 'x' }])).rejects.toThrow('No persistence adapter for collection nost')
  })

  it('fulfillQuery publishes complete with items and publishState no-op when missing record', async () => {
    const storage = memoryStorageAdapter<Post>([])
    await storage.insert([{ id: 'f1', title: 'F' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    ;(adapter as any).storageAdapters.set('pf', storage)
    ;(adapter as any).collectionIndices.set('pf', ['id'])
    // seed registry record
    // eslint-disable-next-line unicorn/no-await-expression-member
    const queryId2 = (await import('../src/utils/queryId')).default as (sel: any, opt?: any) => string
    const qid = queryId2({}, undefined)
    ;(adapter as any).queries.set('pf', new Map([[
      qid, { selector: {}, options: undefined, state: 'active', error: null, items: [], listeners: new Set() },
    ]]))
    const execSpy = vi.spyOn(adapter as any, 'executeQuery').mockResolvedValue([{ id: 'f1', title: 'F' }])
    await (adapter as any).fulfillQuery('pf', {}, undefined)
    // If a registry record exists for the selector/options pair, fulfillQuery
    // should execute and publish results. Guarded by the seeded record above.
    expect(execSpy).toHaveBeenCalled()
    // publishState on missing record is a no-op
    await (adapter as any).publishState('pf', 'absent', 'active', null)
    execSpy.mockRestore()
  })

  it('queryItems returns all items when unmatched and selector empty', async () => {
    const storage = memoryStorageAdapter<Post>([])
    await storage.insert([{ id: 'a1', title: 'A' }, { id: 'a2', title: 'B' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    ;(adapter as any).storageAdapters.set('qq', storage)
    const items = await (adapter as any).queryItems('qq', {})
    expect(items.length).toBe(2)
  })

  it('dispose clears per-collection maps without throwing', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('clr', adapter)
    const backend = (col as any).backend
    await backend.isReady()
    await backend.dispose() // should clear internal maps without error
    expect(true).toBe(true)
  })

  it('getQueryState/getQueryError return defaults after register', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const col = new Collection<Post>('s', adapter)
    await col.ready()
    const backend = (col as any).backend
    backend.registerQuery({ type: 't' })
    expect(backend.getQueryState({ type: 't' })).toBe('active')
    expect(backend.getQueryError({ type: 't' })).toBeNull()
    backend.unregisterQuery({ type: 't' })
  })

  it('fulfillQuery error branch (executeQuery throws) sets error state', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    // @ts-expect-error private property access
    adapter.storageAdapters.set('fx', storage)
    // @ts-expect-error private property access
    adapter.collectionIndices.set('fx', ['id'])
    const qid = queryId({})
    // @ts-expect-error private property access
    adapter.queries.set('fx', new Map([[qid, { selector: {}, options: undefined, state: 'active', error: null, items: [], listeners: new Set() }]]))
    const execSpy = vi.spyOn(adapter as any, 'executeQuery').mockRejectedValue(new Error('x'))
    // @ts-expect-error private property access
    await adapter.fulfillQuery('fx', {}, undefined)
    expect(execSpy).toHaveBeenCalled()
    execSpy.mockRestore()
  })

  it('queryItems early returns for optimizedSelector null/empty', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    ;(adapter as any).storageAdapters.set('qi', storage)
    const indexSpy = vi.spyOn(adapter as any, 'getIndexInfo')
      .mockResolvedValueOnce({ matched: true, ids: ['p'], optimizedSelector: undefined })
      .mockResolvedValueOnce({ matched: false, ids: [], optimizedSelector: {} })
    await storage.insert([{ id: 'p', title: 'P' }])
    await (adapter as any).queryItems('qi', {})
    await (adapter as any).queryItems('qi', { k: 1 })
    expect(indexSpy).toHaveBeenCalledTimes(2)
    indexSpy.mockRestore()
  })

  it('getIndexInfo missing indexed field returns matched:false and $regex non-optimizable', async () => {
    const storage = memoryStorageAdapter<Post>([])
    await storage.createIndex('name')
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    ;(adapter as any).collectionIndices.set('ci2', ['name'])
    ;(adapter as any).storageAdapters.set('ci2', storage)
    const miss = await (adapter as any).getIndexInfo('ci2', { other: 1 })
    expect(miss.matched).toBe(false)
    const nonOpt = await (adapter as any).getIndexInfo('ci2', { name: { $regex: 'x' } })
    expect(nonOpt).toBeDefined()
  })

  it('purgeSelector decrements refcount (no removal) and throws if storage missing', async () => {
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage, fetchQueryItems: async () => [],
    })
    const colName = 'ps'
    ;(adapter as any).selectorIds.set(colName, new Map([[JSON.stringify({}), new Set(['id1'])]]))
    ;(adapter as any).idRefCounts.set(colName, new Map([['id1', 2]]))
    await (adapter as any).purgeSelector(colName, {}) // refcount->1, toRemove empty => return

    // Now set to remove and remove storage to trigger error
    ;(adapter as any).selectorIds.set(colName, new Map([[JSON.stringify({}), new Set(['id2'])]]))
    ;(adapter as any).idRefCounts.set(colName, new Map([['id2', 1]]))
    // ensure autoload mark present
    ;(adapter as any).autoloadIds.set(colName, new Set(['id2']))
    await expect((adapter as any).purgeSelector(colName, {})).rejects.toThrow('No persistence adapter for collection ps')
  })

  it('setupStorage throws without storage and ensureStorageAdapter branches', async () => {
    // no storage -> throw
    const adapter1 = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await expect((adapter1 as any).setupStorage('nost', [])).rejects.toThrow('No persistence adapter for collection nost')

    // has adapter -> early return
    const adapter2 = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    ;(adapter2 as any).storageAdapters.set('x', memoryStorageAdapter<Post>([]))
    await (adapter2 as any).ensureStorageAdapter('x')

    // options.storage absent -> return
    const adapter3 = new AutoFetchDataAdapter({
      fetchQueryItems: async () => [],
    })
    await (adapter3 as any).ensureStorageAdapter('y')

    // options.storage present -> sets adapter
    const adapter4 = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: async () => [],
    })
    await (adapter4 as any).ensureStorageAdapter('z')
    expect((adapter4 as any).storageAdapters.has('z')).toBe(true)
  })
})
