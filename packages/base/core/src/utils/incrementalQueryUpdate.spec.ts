import { describe, expect, it } from 'vitest'
import type Selector from '../types/Selector'
import applyQueryOptions from './applyQueryOptions'
import incrementalQueryUpdate from './incrementalQueryUpdate'

interface Item {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
}

describe('incrementalQueryUpdate', () => {
  describe('cases it declines', () => {
    it('should decline a query with a limit, because it cannot see past the window', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        {},
        { limit: 10 },
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a query with a skip, for the same reason', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        {},
        { skip: 1 },
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a projected query that is also sorted, because the sort key may be projected away', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        {},
        { fields: { name: 1 }, sort: { rank: 1 } },
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a null selector', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        null as unknown as Selector<Item>,
        {},
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })
  })

  describe('agreement with a full re-execution', () => {
    const allItems: Item[] = [
      { id: 'a', status: 'open', rank: 3, name: 'Anna' },
      { id: 'b', status: 'done', rank: 1, name: 'Ben' },
      { id: 'c', status: 'open', rank: 2, name: 'Cleo' },
      { id: 'd', status: 'open', rank: 5, name: 'Dan' },
    ]

    /**
     * Runs a change through both paths and returns what each of them produced: the incremental
     * update from the previous result, and a full re-execution over all items. The whole contract
     * of the incremental path is that these two never disagree.
     * @param selector - The query's selector.
     * @param options - The query's options.
     * @param apply - Applies the change to all items and reports it as a changeset.
     * @returns The incremental result and the re-executed one.
     */
    const bothPaths = (
      selector: Record<string, any>,
      options: Record<string, any> | undefined,
      apply: (items: Item[]) => {
        items: Item[],
        changes: { upserts: Item[], deletes: string[] },
      },
    ) => {
      const previous = applyQueryOptions(allItems, selector, options)
      const { items: nextAllItems, changes } = apply(allItems)
      return {
        incremental: incrementalQueryUpdate(previous, selector, options, changes),
        reExecuted: applyQueryOptions(nextAllItems, selector, options),
      }
    }

    it('should match for an insert into an unsorted query', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        {},
        (items) => {
          const item: Item = { id: 'e', status: 'open', rank: 4, name: 'Eve' }
          return { items: [...items, item], changes: { upserts: [item], deletes: [] } }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an insert into a sorted query', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { id: 'e', status: 'open', rank: 4, name: 'Eve' }
          return { items: [...items, item], changes: { upserts: [item], deletes: [] } }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an insert that does not match the selector', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { id: 'e', status: 'done', rank: 4, name: 'Eve' }
          return { items: [...items, item], changes: { upserts: [item], deletes: [] } }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an update that keeps the item in the result', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { ...items[0], name: 'Annabel' }
          return {
            items: items.map(current => (current.id === item.id ? item : current)),
            changes: { upserts: [item], deletes: [] },
          }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an update that reorders the result', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { ...items[0], rank: 0 }
          return {
            items: items.map(current => (current.id === item.id ? item : current)),
            changes: { upserts: [item], deletes: [] },
          }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an update that pushes the item out of the result', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { ...items[0], status: 'done' }
          return {
            items: items.map(current => (current.id === item.id ? item : current)),
            changes: { upserts: [item], deletes: [] },
          }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an update that pulls the item into the result', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { ...items[1], status: 'open' }
          return {
            items: items.map(current => (current.id === item.id ? item : current)),
            changes: { upserts: [item], deletes: [] },
          }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for a removal', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        items => ({
          items: items.filter(item => item.id !== 'c'),
          changes: { upserts: [], deletes: ['c'] },
        }))
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for a removal of an item outside the result', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        items => ({
          items: items.filter(item => item.id !== 'b'),
          changes: { upserts: [], deletes: ['b'] },
        }))
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for a batch touching several items at once', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        (items) => {
          const updated: Item = { ...items[3], rank: 0 }
          const inserted: Item = { id: 'e', status: 'open', rank: 6, name: 'Eve' }
          return {
            items: [
              ...items.filter(item => item.id !== 'a' && item.id !== 'd'),
              updated,
              inserted,
            ],
            changes: { upserts: [updated, inserted], deletes: ['a'] },
          }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for a projected but unsorted query', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { fields: { name: 1 } },
        (items) => {
          const item: Item = { id: 'e', status: 'open', rank: 4, name: 'Eve' }
          return { items: [...items, item], changes: { upserts: [item], deletes: [] } }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match for an empty selector', () => {
      const { incremental, reExecuted } = bothPaths(
        {},
        { sort: { rank: 1 } },
        (items) => {
          const item: Item = { id: 'e', status: 'done', rank: 4, name: 'Eve' }
          return { items: [...items, item], changes: { upserts: [item], deletes: [] } }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match when a change removes everything from the result', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { sort: { rank: 1 } },
        items => ({
          items: items.filter(item => item.status !== 'open'),
          changes: { upserts: [], deletes: ['a', 'c', 'd'] },
        }))
      expect(incremental).toEqual(reExecuted)
    })
  })

  it('should not mutate the previous result', () => {
    const previous: Item[] = [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }]
    const snapshot = [...previous]
    incrementalQueryUpdate(previous, {}, { sort: { rank: 1 } }, {
      upserts: [{ id: 'c', rank: 0 }],
      deletes: ['a'],
    })
    expect(previous).toEqual(snapshot)
  })

  it('should treat a later upsert of the same id as the current state', () => {
    const result = incrementalQueryUpdate([], {}, {}, {
      upserts: [{ id: 'a', rank: 1 }, { id: 'a', rank: 2 }],
      deletes: [],
    })
    expect(result).toEqual([{ id: 'a', rank: 2 }])
  })
})
