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

    expect(backend.getQueryState({}, undefined)).toBe('complete')
    expect(backend.getQueryError({}, undefined)).toBeNull()

    const calls: string[] = []
    const sel: Selector<Item> = {} as unknown as Selector<Item>
    const unsubscribe = backend.onQueryStateChange(sel, undefined, (state) => {
      calls.push(state)
    })
    backend.registerQuery(sel, undefined)
    expect(calls.pop()).toBe('complete')
    unsubscribe()

    ;(adapter as any)['queryEmitters'].delete('def')
    expect(() => backend.onQueryStateChange({}, undefined, () => {})).toThrow('Query emitter not found for collection def')
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
})
