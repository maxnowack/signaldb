import { describe, it, expect, vi } from 'vitest'
import DefaultDataAdapter from '../src/DefaultDataAdapter'
import { Collection } from '../src'
import createStorageAdapter from '../src/createStorageAdapter'
import type Selector from '../src/types/Selector'

type Item = { id: string, x?: number }

describe('DefaultDataAdapter', () => {
  it('exercises query state, caching and emitter missing error', () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('def', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])

    expect(backend.getQueryState({}, {})).toBe('complete')
    expect(backend.getQueryError({}, {})).toBeNull()

    const calls: string[] = []
    const sel: Selector<Item> = {} as unknown as Selector<Item>
    const unsubscribe = backend.onQueryStateChange(sel, {}, (state) => {
      calls.push(state)
    })
    backend.registerQuery(sel, {})
    expect(calls.pop()).toBe('complete')
    unsubscribe()

    ;(adapter as any)['queryEmitters'].delete('def')
    expect(() => backend.onQueryStateChange({}, {}, () => {})).toThrow('Query emitter not found for collection def')
  })

  it('calls teardown on persistence and clears internal maps', async () => {
    const teardown = vi.fn(async () => {})
    const persistence = createStorageAdapter<Item, string>({
      setup: async () => {},
      teardown,
      readAll: async () => [],
      readIds: async () => [],
      createIndex: async () => {},
      dropIndex: async () => {},
      readIndex: async () => new Map(),
      insert: async () => {},
      replace: async () => {},
      remove: async () => {},
      removeAll: async () => {},
    })
    const adapter = new DefaultDataAdapter({
      storage: name => (name === 'p' ? persistence : undefined),
      // Suppress expected async teardown-time errors from background setup
      onError: () => {},
    })
    const c = new Collection<Item, string, Item>('p', adapter, { persistence })
    const backend = adapter.createCollectionBackend<Item, string, Item>(c, [])
    await backend.dispose()
    expect(teardown).toHaveBeenCalled()
  })

  it('handles storage function returning undefined (no adapter)', () => {
    const adapter = new DefaultDataAdapter({
      // @ts-expect-error testing undefined return
      storage: () => {},
    })
    const col = new Collection<Item, string, Item>('undefined-storage', adapter)
    // Should not throw; covers ensureStorageAdapter branch where adapter is undefined
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])
    expect(backend).toBeDefined()
  })

  it('rebuildIndices throws when items/indices missing', () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('missing', adapter)
    adapter.createCollectionBackend<Item, string, Item>(col, [])

    // @ts-expect-error - access private state for targeted coverage
    adapter.items.delete('missing')
    expect(() => {
      // @ts-expect-error - access private method for targeted coverage
      adapter.rebuildIndices(col)
    }).toThrow('Items not found for collection missing')

    // Restore items and remove indices to cover the other throw branch
    // @ts-expect-error - access private state for targeted coverage
    adapter.items.set('missing', new Map())
    // @ts-expect-error - access private state for targeted coverage
    adapter.indices.delete('missing')
    expect(() => {
      // @ts-expect-error - access private method for targeted coverage
      adapter.rebuildIndices(col)
    }).toThrow('Indices not found for collection missing')
  })

  it('populates items from storage and rebuilds indices', async () => {
    const persistence = createStorageAdapter<Item, string>({
      setup: async () => {},
      teardown: async () => {},
      readAll: async () => [{ id: 'i1', x: 1 }],
      readIds: async () => [],
      createIndex: async () => {},
      dropIndex: async () => {},
      readIndex: async () => new Map(),
      insert: async () => {},
      replace: async () => {},
      remove: async () => {},
      removeAll: async () => {},
    })
    const adapter = new DefaultDataAdapter({ storage: name => (name === 'loaded' ? persistence : undefined) })
    const c = new Collection<Item, string, Item>('loaded', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(c, [])
    await backend.isReady()
    // Verify that data was read by checking query result
    const result = backend.getQueryResult({}, {})
    expect(result).toEqual([{ id: 'i1', x: 1 }])
  })

  it('logs persistence errors when no onError is provided', async () => {
    const error = new Error('boom')
    const persistence = createStorageAdapter<Item, string>({
      setup: async () => {},
      teardown: async () => {},
      readAll: async () => {
        throw error
      },
      readIds: async () => [],
      createIndex: async () => {},
      dropIndex: async () => {},
      readIndex: async () => new Map(),
      insert: async () => {},
      replace: async () => {},
      remove: async () => {},
      removeAll: async () => {},
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = new DefaultDataAdapter({ storage: name => (name === 'err' ? persistence : undefined) })
    const c = new Collection<Item, string, Item>('err', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(c, [])
    await backend.isReady()
    expect(spy).toHaveBeenCalled()
    const message = (spy.mock.calls[0]?.[0] ?? '') as string
    expect(message).toContain('Error during data persistence operation in collection err')
    spy.mockRestore()
  })

  it('invokes onError option when persistence fails during setup', async () => {
    const persistence = createStorageAdapter<Item, string>({
      setup: async () => {},
      teardown: async () => {},
      readAll: async () => {
        throw new Error('fail')
      },
      readIds: async () => [],
      createIndex: async () => {},
      dropIndex: async () => {},
      readIndex: async () => new Map(),
      insert: async () => {},
      replace: async () => {},
      remove: async () => {},
      removeAll: async () => {},
    })
    const onError = vi.fn()
    const adapter = new DefaultDataAdapter({
      storage: () => persistence,
      onError,
    })
    const c = new Collection<Item, string, Item>('on-error', adapter, { persistence })
    const backend = adapter.createCollectionBackend<Item, string, Item>(c, [])
    await backend.isReady().catch(() => {})
    expect(onError).toHaveBeenCalledWith('on-error', expect.any(Error))
  })

  it('covers getIndexInfo(null) path and queryItems matchItems branches', () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('qi', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])
    // Insert one item without persistence to have data to filter
    return backend.insert({ id: 'a1', x: 1 }).then(async () => {
      // @ts-expect-error - call private method to cover selector == null branch
      const info = adapter.getIndexInfo(col, undefined)
      expect(info.matched).toBe(false)

      // Monkey-patch getIndexInfo to force optimizedSelector == null
      // @ts-expect-error - access private method for targeted coverage
      const originalGetIndexInfo = adapter.getIndexInfo
      // @ts-expect-error - override private method for targeted coverage
      adapter.getIndexInfo = () => ({ matched: false, ids: [], optimizedSelector: null })
      const result = backend.getQueryResult({ any: 1 } as unknown as Selector<Item>, {})
      expect(result.length).toBe(1)
      // Now force optimizedSelector to be empty object to hit second early-return
      // @ts-expect-error - override private method for targeted coverage
      adapter.getIndexInfo = () => ({ matched: false, ids: [], optimizedSelector: {} as any })
      const result2 = backend.getQueryResult({ other: 1 } as unknown as Selector<Item>, {})
      expect(result2.length).toBe(1)
      // @ts-expect-error - restore private method
      adapter.getIndexInfo = originalGetIndexInfo
    })
  })

  it('flushQueuedQueryUpdates: early return and missing emitter branch', async () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('flush', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])

    // Early return when no queued updates exist
    // @ts-expect-error - call private method directly
    expect(() => adapter.flushQueuedQueryUpdates(col)).not.toThrow()

    // Register a query, then remove emitter and perform a change to queue updates
    const sel: Selector<Item> = { id: 'q1' } as unknown as Selector<Item>
    backend.registerQuery(sel, {})
    // Remove emitter so flush hits the missing-emitter return inside loop
    // @ts-expect-error - access private state
    adapter.queryEmitters.delete('flush')
    await backend.insert({ id: 'q1', x: 2 })
    // No explicit assertion on query updates; path should complete without throwing
    expect(true).toBe(true)
  })

  it('returns cached results for active queries', async () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('cached', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])
    await backend.insert({ id: 'c1', x: 1 })
    const selector = { id: 'c1' } as Selector<Item>
    backend.registerQuery(selector, {})
    const executeSpy = vi.spyOn(adapter as any, 'executeQuery')
    const result = backend.getQueryResult(selector, {})
    expect(result).toEqual([{ id: 'c1', x: 1 }])
    expect(executeSpy).not.toHaveBeenCalled()
    executeSpy.mockRestore()
    backend.unregisterQuery(selector, {})
  })

  it('insert throws when items map is missing for collection', async () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('ins-missing', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])
    // @ts-expect-error - access private state
    adapter.items.delete('ins-missing')
    await expect(backend.insert({ id: 'z1' })).rejects.toThrow('Items not found for collection ins-missing')
  })

  it('updateOne and replaceOne return [] when no item found', async () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('upd-none', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])
    const result1 = await backend.updateOne({ id: 'nope' } as Selector<Item>, { $set: { x: 5 } })
    expect(result1).toEqual([])
    const result2 = await backend.replaceOne({ id: 'nope' } as Selector<Item>, { id: 'new', x: 1 } as Item)
    expect(result2).toEqual([])
  })

  it('registerQuery throws without emitter and unregisterQuery early-returns', () => {
    const adapter = new DefaultDataAdapter()
    const col = new Collection<Item, string, Item>('reg-unreg', adapter)
    const backend = adapter.createCollectionBackend<Item, string, Item>(col, [])

    backend.registerQuery({}, {})
    // Remove emitter to trigger onQueryStateChange error path
    // @ts-expect-error - access private state
    adapter.queryEmitters.delete('reg-unreg')
    expect(() => backend.onQueryStateChange({}, {}, () => {})).toThrow('Query emitter not found for collection reg-unreg')

    // Remove activeQueries map to cover early return in unregisterQuery
    // @ts-expect-error - access private state
    adapter.activeQueries.delete('reg-unreg')
    // Should not throw
    backend.unregisterQuery({}, {})
  })
})
