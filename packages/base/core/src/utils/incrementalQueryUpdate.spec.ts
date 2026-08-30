import { describe, expect, it } from 'vitest'
import type { QueryOptions } from '../DataAdapter'
import type Selector from '../types/Selector'
import applyQueryOptions from './applyQueryOptions'
import incrementalQueryUpdate from './incrementalQueryUpdate'

interface Item {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
  meta?: { rank?: number },
}

describe('incrementalQueryUpdate', () => {
  describe('cases it declines', () => {
    it('should decline a full window that loses one of its items', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }],
        {},
        { sort: { rank: 1 }, limit: 2 },
        { upserts: [], deletes: ['a'] },
      )
      expect(result).toBeNull()
    })

    it('should decline a full window whose item stops matching', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a', rank: 1, status: 'open' }, { id: 'b', rank: 2, status: 'open' }],
        { status: 'open' },
        { sort: { rank: 1 }, limit: 2 },
        { upserts: [{ id: 'a', rank: 1, status: 'done' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a full window whose item moves past its edge', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }],
        {},
        { sort: { rank: 1 }, limit: 2 },
        { upserts: [{ id: 'a', rank: 99 }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a full window that is not sorted, having no edge to speak of', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }, { id: 'b' }],
        {},
        { limit: 2 },
        { upserts: [{ id: 'c' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a full window whose items are projected', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }, { id: 'b' }],
        {},
        { sort: { rank: 1 }, limit: 2, fields: { name: 1 } },
        { upserts: [{ id: 'c', rank: 0 }], deletes: [] },
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

    it('should decline a projected query whose sort key the projection drops', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        {},
        { fields: { name: 1 }, sort: { rank: 1 } },
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a projected query whose sort key the projection excludes', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        {},
        { fields: { rank: 0 }, sort: { rank: 1 } },
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline sorting by an id the projection excludes', () => {
      const result = incrementalQueryUpdate(
        [{ rank: 1 } as Item],
        {},
        { fields: { id: 0, rank: 1 }, sort: { id: 1 } },
        { upserts: [{ id: 'b', rank: 2 }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline when only one of several sort keys survives', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a', rank: 1 }],
        {},
        { fields: { rank: 1 }, sort: { rank: 1, name: -1 } },
        { upserts: [{ id: 'b', rank: 2, name: 'Ben' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    // The case a list screen actually has: it sorts by a date it also displays.
    // Declining it made every write to that collection re-read, re-sort and
    // re-project the whole table — 600 ms of database time for a single-row
    // insert against three thousand rows.
    it('should answer a projected query whose sort key the projection keeps', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a', rank: 1 }],
        {},
        { fields: { rank: 1 }, sort: { rank: 1 } },
        { upserts: [{ id: 'b', rank: 0, name: 'Ben' }], deletes: [] },
      )
      // Sorted by the surviving key, and the new item projected the same way as
      // the old one — no `name` on it.
      expect(result).toEqual([{ id: 'b', rank: 0 }, { id: 'a', rank: 1 }])
    })

    it('should answer when an inclusion of an ancestor keeps a nested sort key', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a', meta: { rank: 1 } }],
        {},
        { fields: { meta: 1 }, sort: { 'meta.rank': 1 } },
        { upserts: [{ id: 'b', meta: { rank: 0 } }], deletes: [] },
      )
      expect(result?.map(item => item.id)).toEqual(['b', 'a'])
    })

    it('should decline when an exclusion of an ancestor drops a nested sort key', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'a' }],
        {},
        { fields: { meta: 0 }, sort: { 'meta.rank': 1 } },
        { upserts: [{ id: 'b' }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should answer a sort by id under an inclusion that keeps id implicitly', () => {
      const result = incrementalQueryUpdate(
        [{ id: 'b', rank: 2 }],
        {},
        { fields: { rank: 1 }, sort: { id: 1 } },
        { upserts: [{ id: 'a', rank: 1 }], deletes: [] },
      )
      expect(result?.map(item => item.id)).toEqual(['a', 'b'])
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

    // The shape a list screen has, and the one this used to decline outright.
    it('should match for a query that is both projected and sorted by a kept field', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { fields: { name: 1, rank: 1 }, sort: { rank: 1 } },
        (items) => {
          const item: Item = { id: 'e', status: 'open', rank: 0, name: 'Eve' }
          return { items: [...items, item], changes: { upserts: [item], deletes: [] } }
        })
      expect(incremental).toEqual(reExecuted)
    })

    it('should match when a projected, sorted query loses an item to an update', () => {
      const { incremental, reExecuted } = bothPaths(
        { status: 'open' },
        { fields: { name: 1, rank: 1 }, sort: { rank: -1 } },
        (items) => {
          const updated: Item = { ...items[0], status: 'done' }
          return {
            items: [...items.filter(item => item.id !== updated.id), updated],
            changes: { upserts: [updated], deletes: [] },
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

  describe('a window onto a larger set', () => {
    const allItems: Item[] = Array.from({ length: 12 }, (_, index) => ({
      id: `id-${index}`,
      status: index % 3 === 0 ? 'done' : 'open',
      rank: index,
      name: `name-${index}`,
    }))
    const selector = { status: 'open' }

    /**
     * Runs a change through the incremental path and a full re-execution.
     * @param options - The query's options.
     * @param nextAllItems - Every item the store holds after the change.
     * @param changes - The change, as the store would describe it.
     * @param changes.upserts - The items that exist after the change.
     * @param changes.deletes - The ids that no longer exist.
     * @returns Both answers; the incremental one is `null` when it declined.
     */
    const bothPaths = (
      options: Record<string, any>,
      nextAllItems: Item[],
      changes: { upserts: Item[], deletes: string[] },
    ) => ({
      incremental: incrementalQueryUpdate(
        applyQueryOptions(allItems, selector, options),
        selector,
        options,
        changes,
      ),
      reExecuted: applyQueryOptions(nextAllItems, selector, options),
    })

    it('should answer a window that is not full, having nothing beyond it', () => {
      const options = { sort: { rank: 1 }, limit: 50 }
      const item: Item = { id: 'new', status: 'open', rank: -1, name: 'New' }
      const { incremental, reExecuted } = bothPaths(
        options,
        [...allItems, item],
        { upserts: [item], deletes: [] },
      )
      expect(incremental).toEqual(reExecuted)
    })

    it('should answer an insert that sorts into a full window', () => {
      const options = { sort: { rank: 1 }, limit: 3 }
      const item: Item = { id: 'new', status: 'open', rank: -1, name: 'New' }
      const { incremental, reExecuted } = bothPaths(
        options,
        [...allItems, item],
        { upserts: [item], deletes: [] },
      )
      expect(incremental).toEqual(reExecuted)
      expect(incremental).toHaveLength(3)
    })

    it('should answer an insert that sorts past a full window', () => {
      const options = { sort: { rank: 1 }, limit: 3 }
      const item: Item = { id: 'new', status: 'open', rank: 99, name: 'New' }
      const { incremental, reExecuted } = bothPaths(
        options,
        [...allItems, item],
        { upserts: [item], deletes: [] },
      )
      expect(incremental).toEqual(reExecuted)
    })

    it('should answer an update inside a full window that stays inside it', () => {
      const options = { sort: { rank: 1 }, limit: 3 }
      const item: Item = { ...allItems[1], name: 'renamed' }
      const { incremental, reExecuted } = bothPaths(
        options,
        allItems.map(entry => (entry.id === item.id ? item : entry)),
        { upserts: [item], deletes: [] },
      )
      expect(incremental).toEqual(reExecuted)
    })

    it('should answer a removal beyond a full window', () => {
      const options = { sort: { rank: 1 }, limit: 3 }
      const { incremental, reExecuted } = bothPaths(
        options,
        allItems.filter(entry => entry.id !== 'id-11'),
        { upserts: [], deletes: ['id-11'] },
      )
      expect(incremental).toEqual(reExecuted)
    })

    it('should decline a query that skips, having items before it too', () => {
      const options = { sort: { rank: 1 }, limit: 3, skip: 1 }
      const item: Item = { id: 'new', status: 'open', rank: -1, name: 'New' }
      const { incremental } = bothPaths(options, [...allItems, item], {
        upserts: [item],
        deletes: [],
      })
      expect(incremental).toBeNull()
    })

    const byRankThenId = (items: Item[]) => [...items]
      .toSorted((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.id.localeCompare(b.id))

    it('should keep items that sort equally in the order it already had them', () => {
      const options: QueryOptions<Item> = { sort: { rank: 1 }, limit: 4 }
      const previous: Item[] = [
        { id: 'x', rank: 1 }, { id: 'y', rank: 2 }, { id: 'z', rank: 3 }, { id: 'w', rank: 9 },
      ]
      const result = incrementalQueryUpdate(previous, {}, options, {
        upserts: [{ id: 'z', rank: 2 }],
        deletes: [],
      })
      expect(result?.map(item => item.id)).toEqual(['x', 'y', 'z', 'w'])
    })

    it('should decline a change that ties with the edge of a full window', () => {
      const options: QueryOptions<Item> = { sort: { rank: 1 }, limit: 2 }
      const result = incrementalQueryUpdate(
        [{ id: 'x', rank: 1 }, { id: 'y', rank: 2 }],
        {},
        options,
        { upserts: [{ id: 'z', rank: 2 }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should decline a full window whose last two items sort equally', () => {
      const options: QueryOptions<Item> = { sort: { rank: 1 }, limit: 2 }
      const result = incrementalQueryUpdate(
        [{ id: 'x', rank: 2 }, { id: 'y', rank: 2 }],
        {},
        options,
        { upserts: [{ id: 'z', rank: 0 }], deletes: [] },
      )
      expect(result).toBeNull()
    })

    it('should never disagree with a full re-execution, whatever the change', () => {
      let seed = 7
      const random = () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
        return seed / 2_147_483_648
      }
      let answered = 0

      for (let run = 0; run < 400; run += 1) {
        const options = { sort: { rank: 1 }, limit: 1 + Math.floor(random() * 6) }
        const target = allItems[Math.floor(random() * allItems.length)]
        const roll = random()

        let nextAllItems: Item[]
        let changes: { upserts: Item[], deletes: string[] }
        if (roll < 0.3) {
          const item: Item = {
            id: `new-${run}`,
            status: random() > 0.4 ? 'open' : 'done',
            rank: Math.floor(random() * 16) - 2,
            name: 'New',
          }
          nextAllItems = [...allItems, item]
          changes = { upserts: [item], deletes: [] }
        } else if (roll < 0.6) {
          nextAllItems = allItems.filter(entry => entry.id !== target.id)
          changes = { upserts: [], deletes: [target.id] }
        } else {
          const item: Item = {
            ...target,
            rank: Math.floor(random() * 16) - 2,
            status: random() > 0.3 ? 'open' : 'done',
          }
          nextAllItems = allItems.map(entry => (entry.id === item.id ? item : entry))
          changes = { upserts: [item], deletes: [] }
        }

        const { incremental, reExecuted } = bothPaths(options, nextAllItems, changes)
        if (incremental == null) continue
        answered += 1
        // Compared with ties broken by id: which of two items sorting equally comes first is not
        // something the query asks for, and a re-execution answers it from the order the store
        // happens to hold them in.
        expect(byRankThenId(incremental)).toEqual(byRankThenId(reExecuted))
      }

      // A rule that declined everything would pass the assertion above and be useless.
      expect(answered).toBeGreaterThan(100)
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
