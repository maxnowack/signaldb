import { describe, it, expect, beforeEach, vi } from 'vitest'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import Collection from '../src/Collection'
import type { CollectionBackend, QueryOptions } from '../src/DataAdapter'
import queryId from '../src/utils/queryId'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
}

describe('AsyncDataAdapter incremental query updates', () => {
  let adapter: AsyncDataAdapter
  let collection: Collection<TestItem>
  let backend: CollectionBackend<TestItem, string>
  let storage: ReturnType<typeof memoryStorageAdapter<TestItem>>

  const seed: TestItem[] = [
    { id: 'a', status: 'open', rank: 3, name: 'Anna' },
    { id: 'b', status: 'done', rank: 1, name: 'Ben' },
    { id: 'c', status: 'open', rank: 2, name: 'Cleo' },
  ]

  const selector = { status: 'open' }
  const options: QueryOptions<TestItem> = { sort: { rank: 1 } }

  beforeEach(async () => {
    storage = memoryStorageAdapter<TestItem>(seed.map(item => ({ ...item })))
    adapter = new AsyncDataAdapter({ storage: () => storage })
    collection = new Collection<TestItem>('items', adapter)
    backend = (collection as any).backend as CollectionBackend<TestItem, string>
    await backend.isReady()
  })

  const registerAndSettle = async (
    querySelector: Record<string, any>,
    queryOptions: QueryOptions<TestItem>,
  ) => {
    backend.registerQuery(querySelector, queryOptions)
    await vi.waitFor(() =>
      expect(backend.getQueryState(querySelector, queryOptions)).toBe('complete'))
  }

  const settledResult = async (
    querySelector: Record<string, any>,
    queryOptions: QueryOptions<TestItem>,
    predicate: (items: TestItem[]) => boolean,
  ) => {
    let current: TestItem[] = []
    await vi.waitFor(() => {
      current = backend.getQueryResult(querySelector, queryOptions)
      expect(predicate(current)).toBe(true)
    })
    return current
  }

  describe('what it asks the storage for', () => {
    it('does not read the collection back for an unlimited query', async () => {
      await registerAndSettle(selector, options)

      const readAll = vi.spyOn(storage, 'readAll')
      await backend.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } })
      await settledResult(selector, options, items =>
        items.some(item => item.name === 'Annabel'))

      expect(readAll).not.toHaveBeenCalled()
    })

    it('answers a limited query from its window when the window keeps its items', async () => {
      // The window holds `c`; `a` sorts after it and stays outside either way.
      const limited: QueryOptions<TestItem> = { sort: { rank: 1 }, limit: 1 }
      await registerAndSettle(selector, limited)

      const readAll = vi.spyOn(storage, 'readAll')
      await backend.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } })
      await settledResult(selector, limited, items => items.length === 1)

      expect(readAll).not.toHaveBeenCalled()
      expect(backend.getQueryResult(selector, limited).map(item => item.id)).toEqual(['c'])
    })

    it('reads the collection back when a full window loses one of its items', async () => {
      // Removing `c` empties the window, and what moves up into it is beyond what it holds.
      const limited: QueryOptions<TestItem> = { sort: { rank: 1 }, limit: 1 }
      await registerAndSettle(selector, limited)

      const readAll = vi.spyOn(storage, 'readAll')
      await backend.removeOne({ id: 'c' })
      await vi.waitFor(() => expect(readAll).toHaveBeenCalled())

      const items = await settledResult(selector, limited, result => result.length === 1)
      expect(items.map(item => item.id)).toEqual(['a'])
    })

    it('reads the collection back for the first answer to a query', async () => {
      const readAll = vi.spyOn(storage, 'readAll')
      await registerAndSettle(selector, options)
      expect(readAll).toHaveBeenCalled()
    })
  })

  describe('what it computes', () => {
    it('reflects an insert at its sorted position', async () => {
      await registerAndSettle(selector, options)

      await backend.insert({ id: 'd', status: 'open', rank: 1, name: 'Dan' })
      const items = await settledResult(selector, options, result => result.length === 3)
      expect(items.map(item => item.id)).toEqual(['d', 'c', 'a'])
    })

    it('reflects an update', async () => {
      await registerAndSettle(selector, options)

      await backend.updateOne({ id: 'c' }, { $set: { name: 'Cleopatra' } })
      const items = await settledResult(selector, options, result =>
        result.some(item => item.name === 'Cleopatra'))
      expect(items).toEqual([
        { id: 'c', status: 'open', rank: 2, name: 'Cleopatra' },
        { id: 'a', status: 'open', rank: 3, name: 'Anna' },
      ])
    })

    it('reflects an item leaving the query', async () => {
      await registerAndSettle(selector, options)

      await backend.updateOne({ id: 'a' }, { $set: { status: 'done' } })
      const items = await settledResult(selector, options, result => result.length === 1)
      expect(items.map(item => item.id)).toEqual(['c'])
    })

    it('reflects an item entering the query', async () => {
      await registerAndSettle(selector, options)

      await backend.updateOne({ id: 'b' }, { $set: { status: 'open' } })
      const items = await settledResult(selector, options, result => result.length === 3)
      expect(items.map(item => item.id)).toEqual(['b', 'c', 'a'])
    })

    it('reflects a removal', async () => {
      await registerAndSettle(selector, options)

      await backend.removeOne({ id: 'c' })
      const items = await settledResult(selector, options, result => result.length === 1)
      expect(items.map(item => item.id)).toEqual(['a'])
    })

    it('reflects a batch update', async () => {
      await registerAndSettle(selector, options)

      await backend.updateMany({ status: 'open' }, { $set: { name: 'renamed' } })
      const items = await settledResult(selector, options, result =>
        result.every(item => item.name === 'renamed'))
      expect(items.map(item => item.id)).toEqual(['c', 'a'])
    })

    it('agrees with a full re-execution after a series of writes', async () => {
      await registerAndSettle(selector, options)

      await backend.insert({ id: 'd', status: 'open', rank: 10, name: 'Dan' })
      await backend.updateOne({ id: 'a' }, { $set: { rank: -1 } })
      await backend.removeOne({ id: 'c' })
      await backend.updateOne({ id: 'b' }, { $set: { status: 'open' } })
      await backend.updateOne({ id: 'd' }, { $set: { name: 'Daniel' } })

      const expected = await backend.executeQuery(selector, options)
      const items = await settledResult(selector, options, result =>
        result.length === expected.length)
      expect(items).toEqual(expected)
    })

    it('keeps several queries on the same collection in step', async () => {
      const done = { status: 'done' }
      await registerAndSettle(selector, options)
      await registerAndSettle(done, options)

      await backend.updateOne({ id: 'a' }, { $set: { status: 'done' } })

      const open = await settledResult(selector, options, result => result.length === 1)
      const closed = await settledResult(done, options, result => result.length === 2)
      expect(open.map(item => item.id)).toEqual(['c'])
      expect(closed.map(item => item.id)).toEqual(['b', 'a'])
    })
  })

  describe('what it tells its listeners', () => {
    it('does not send a query through a loading state for an incremental update', async () => {
      await registerAndSettle(selector, options)

      const states: string[] = []
      backend.onQueryStateChange(selector, options, state => states.push(state))
      await backend.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } })
      await settledResult(selector, options, items => items.some(item => item.name === 'Annabel'))

      expect(states).toEqual(['complete'])
    })

    it('says nothing about a query a write does not touch', async () => {
      await registerAndSettle(selector, options)
      const listener = vi.fn()
      backend.onQueryStateChange(selector, options, listener)

      await backend.insert({ id: 'z', status: 'archived', rank: 0, name: 'Zoe' })
      await vi.waitFor(() => expect(
        (adapter as any).queries.get('items').get(queryId(selector, options)).items,
      ).toHaveLength(2))

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
