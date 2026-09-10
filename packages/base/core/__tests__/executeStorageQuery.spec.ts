import { describe, expect, it, vi } from 'vitest'
import type StorageAdapter from '../src/types/StorageAdapter'
import type { StorageQuery, StorageQueryAnswer } from '../src/types/StorageAdapter'
import executeStorageQuery from '../src/utils/executeStorageQuery'

interface Item { id: string, name?: string, rank?: number, secret?: string }

/**
 * The read path every data adapter shares. It used to be three private copies
 * of the same eight lines in `AsyncDataAdapter`, `AutoFetchDataAdapter` and
 * `WorkerDataAdapterHost`, each tested by reaching into the adapter — which is
 * why the copies were free to drift. The behaviour is asserted here once.
 *
 * `getIndexInfo`'s own selector handling ($in, $nin, $exists, non-optimizable
 * operators) is covered by `getIndexInfo.spec.ts` and deliberately not
 * @param items - The items the fake store holds.
 * @param overrides - Adapter methods to replace, above all `query`.
 * @returns A storage adapter over those items.
 */
function storage(items: Item[], overrides: Partial<StorageAdapter<Item, string>> = {}) {
  const byId = new Map(items.map(item => [item.id, item]))
  const adapter: StorageAdapter<Item, string> = {
    setup: async () => {},
    teardown: async () => {},
    readAll: vi.fn(async () => [...byId.values()]),
    readIds: vi.fn(async (ids: string[]) => ids.map(id => byId.get(id)).filter(Boolean) as Item[]),
    createIndex: async () => {},
    dropIndex: async () => {},
    readIndex: vi.fn(async (field: string) => {
      const index = new Map<string | null, Set<string>>()
      for (const item of byId.values()) {
        const value = String((item as Record<string, any>)[field])
        const ids = index.get(value) ?? new Set<string>()
        ids.add(item.id)
        index.set(value, ids)
      }
      return index
    }),
    insert: async () => {},
    replace: async () => {},
    remove: async () => {},
    removeAll: async () => {},
    ...overrides,
  }
  return adapter
}

const items: Item[] = [
  { id: '1', name: 'a', rank: 3, secret: 'x' },
  { id: '2', name: 'b', rank: 1, secret: 'y' },
  { id: '3', name: 'a', rank: 2, secret: 'z' },
]

describe('executeStorageQuery — without a `query` capability', () => {
  it('answers a primary-key selector through readIds, never a full read', async () => {
    // `id` is never a declared index — `readIds` is that lookup — so without
    // this path every point read becomes a full scan.
    const adapter = storage(items)
    const result = await executeStorageQuery<Item>(adapter, ['name'], { id: '2' })

    expect(result.map(item => item.id)).toEqual(['2'])
    expect(adapter.readIds).toHaveBeenCalledWith(['2'])
    expect(adapter.readAll).not.toHaveBeenCalled()
  })

  it('narrows through a declared index and filters what the index could not answer', async () => {
    const adapter = storage(items)
    const result = await executeStorageQuery<Item>(adapter, ['name'], { name: 'a', rank: 2 })

    expect(result.map(item => item.id)).toEqual(['3'])
    expect(adapter.readAll).not.toHaveBeenCalled()
  })

  it('falls back to the whole store when no index matches', async () => {
    const adapter = storage(items)
    const result = await executeStorageQuery<Item>(adapter, ['name'], { rank: 1 })

    expect(result.map(item => item.id)).toEqual(['2'])
    expect(adapter.readAll).toHaveBeenCalled()
  })

  it('returns everything for an empty selector, and nothing for a null one', async () => {
    const adapter = storage(items)

    expect(await executeStorageQuery<Item>(adapter, [], {})).toHaveLength(3)
    expect(await executeStorageQuery<Item>(adapter, [], null)).toEqual([])
  })

  it('sorts, windows and projects in that order', async () => {
    const adapter = storage(items)
    const result = await executeStorageQuery<Item>(adapter, [], {}, {
      sort: { rank: 1 },
      skip: 1,
      limit: 1,
      fields: { name: 1 },
    })

    expect(result).toEqual([{ id: '3', name: 'a' }])
  })
})

describe('executeStorageQuery — with a `query` capability', () => {
  const answering = (
    answer: (query: StorageQuery<Item>) => StorageQueryAnswer<Item>,
  ) => storage(items, {
    query: vi.fn(async (query: StorageQuery<Item>) => answer(query)),
  })

  it('hands the whole question over and reads nothing else', async () => {
    const adapter = answering(() => ({
      items: [items[1]], sorted: true, windowed: true, projected: true,
    }))

    const result = await executeStorageQuery<Item>(adapter, ['name'], { rank: 1 }, { sort: { rank: 1 }, limit: 1, fields: { name: 1 } })

    expect(result).toEqual([items[1]])
    expect(adapter.readAll).not.toHaveBeenCalled()
    expect(adapter.readIds).not.toHaveBeenCalled()
    expect(adapter.readIndex).not.toHaveBeenCalled()
  })

  it('applies the part the adapter declined', async () => {
    // The normal case for a partial translator: it understood the equality and
    // handed back the rest.
    const adapter = answering(() => ({ items, residualSelector: { rank: 2 } }))

    const result = await executeStorageQuery<Item>(adapter, [], { name: 'a', rank: 2 })

    expect(result.map(item => item.id)).toEqual(['3'])
  })

  it('sorts, windows and projects whatever the adapter did not', async () => {
    const adapter = answering(() => ({ items }))

    const result = await executeStorageQuery<Item>(adapter, [], {}, {
      sort: { rank: 1 }, limit: 2, fields: { rank: 1 },
    })

    expect(result).toEqual([{ id: '2', rank: 1 }, { id: '3', rank: 2 }])
  })

  it('refuses a window claimed over an unfiltered set', async () => {
    const adapter = answering(() => ({ items, windowed: true, residualSelector: { rank: 2 } }))

    await expect(executeStorageQuery<Item>(adapter, [], { rank: 2 }, { limit: 1 }))
      .rejects.toThrow('the window is over the wrong set')
  })

  it('refuses a window claimed without an order', async () => {
    const adapter = answering(() => ({ items, windowed: true }))

    await expect(executeStorageQuery<Item>(adapter, [], {}, { sort: { rank: 1 }, limit: 1 }))
      .rejects.toThrow('the window is an arbitrary subset')
  })

  it('refuses a projection that drops the key the caller still has to sort by', async () => {
    const adapter = answering(() => ({ items, projected: true }))

    await expect(executeStorageQuery<Item>(adapter, [], {}, {
      sort: { rank: 1 }, fields: { name: 1 },
    }))
      .rejects.toThrow('the projection drops a key the sort needs')
  })

  it('accepts a projection that keeps the sort key', async () => {
    const adapter = answering(() => ({
      items: items.map(({ id, rank }) => ({ id, rank })), projected: true,
    }))

    const result = await executeStorageQuery<Item>(adapter, [], {}, {
      sort: { rank: 1 }, fields: { rank: 1 },
    })

    expect(result.map(item => item.id)).toEqual(['2', '3', '1'])
  })

  it('is never asked about a null selector', async () => {
    const adapter = answering(() => ({ items }))

    expect(await executeStorageQuery<Item>(adapter, [], null)).toEqual([])
    expect(adapter.query).not.toHaveBeenCalled()
  })
})
