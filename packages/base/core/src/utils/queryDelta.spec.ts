import { describe, expect, it } from 'vitest'
import { applyQueryDelta, canApplyQueryDelta, diffQueryResults, isEmptyQueryDelta } from './queryDelta'

interface Item {
  id: string,
  value?: number,
  name?: string,
}

const items = (...ids: string[]) => ids.map(id => ({ id }))

describe('queryDelta', () => {
  describe('diffQueryResults', () => {
    it('should report nothing for identical results', () => {
      const previous = items('a', 'b', 'c')
      const delta = diffQueryResults(previous, items('a', 'b', 'c'))
      expect(isEmptyQueryDelta(delta)).toBe(true)
      expect(delta).toEqual({ added: [], changed: [], removed: [], moved: [], resultCount: 3 })
    })

    it('should report an appended item', () => {
      const delta = diffQueryResults(items('a', 'b'), items('a', 'b', 'c'))
      expect(delta.added).toEqual([{ index: 2, item: { id: 'c' } }])
      expect(delta.removed).toEqual([])
      expect(delta.changed).toEqual([])
      expect(delta.moved).toEqual([])
    })

    it('should report a prepended item with its index', () => {
      const delta = diffQueryResults(items('b', 'c'), items('a', 'b', 'c'))
      expect(delta.added).toEqual([{ index: 0, item: { id: 'a' } }])
      expect(delta.moved).toEqual([])
    })

    it('should report a removed item by id', () => {
      const delta = diffQueryResults(items('a', 'b', 'c'), items('a', 'c'))
      expect(delta.removed).toEqual(['b'])
      expect(delta.added).toEqual([])
    })

    it('should report a changed item', () => {
      const previous: Item[] = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]
      const next: Item[] = [{ id: 'a', value: 1 }, { id: 'b', value: 3 }]
      const delta = diffQueryResults(previous, next)
      expect(delta.changed).toEqual([{ id: 'b', value: 3 }])
      expect(delta.added).toEqual([])
      expect(delta.removed).toEqual([])
      expect(delta.moved).toEqual([])
    })

    it('should not report a changed item when only its identity differs', () => {
      const previous: Item[] = [{ id: 'a', value: 1 }]
      const next: Item[] = [{ id: 'a', value: 1 }]
      expect(isEmptyQueryDelta(diffQueryResults(previous, next))).toBe(true)
    })

    it('should report a moved item', () => {
      const delta = diffQueryResults(items('a', 'b', 'c'), items('c', 'a', 'b'))
      expect(delta.added).toEqual([])
      expect(delta.removed).toEqual([])
      expect(delta.moved).toEqual([{ index: 0, id: 'c' }])
    })

    it('should keep the number of moves minimal', () => {
      const delta = diffQueryResults(items('a', 'b', 'c', 'd', 'e'), items('e', 'a', 'b', 'c', 'd'))
      expect(delta.moved).toHaveLength(1)
    })

    it('should carry the resulting item count', () => {
      expect(diffQueryResults(items('a'), items('a', 'b', 'c')).resultCount).toBe(3)
      expect(diffQueryResults(items('a', 'b', 'c'), []).resultCount).toBe(0)
    })

    it('should handle a completely replaced result', () => {
      const delta = diffQueryResults(items('a', 'b'), items('c', 'd'))
      expect(delta.removed).toEqual(['a', 'b'])
      expect(delta.added).toEqual([
        { index: 0, item: { id: 'c' } },
        { index: 1, item: { id: 'd' } },
      ])
    })
  })

  describe('applyQueryDelta', () => {
    it('should rebuild the next result from the previous one', () => {
      const cases: [Item[], Item[]][] = [
        [items('a', 'b', 'c'), items('a', 'b', 'c')],
        [items('a', 'b'), items('a', 'b', 'c')],
        [items('b', 'c'), items('a', 'b', 'c')],
        [items('a', 'b', 'c'), items('a', 'c')],
        [items('a', 'b', 'c'), items('c', 'b', 'a')],
        [items('a', 'b', 'c'), items('c', 'a', 'b')],
        [items('a', 'b', 'c', 'd', 'e'), items('e', 'd', 'a')],
        [items('a'), []],
        [[], items('a', 'b')],
        [[], []],
        [
          [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
          [{ id: 'b', value: 5 }, { id: 'a', value: 1 }, { id: 'c', value: 9 }],
        ],
        [
          [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }],
          [{ id: 'c', value: 3 }, { id: 'a', value: 7 }],
        ],
      ]

      cases.forEach(([previous, next]) => {
        const delta = diffQueryResults(previous, next)
        expect(applyQueryDelta(previous, delta)).toEqual(next)
      })
    })

    it('should rebuild randomly generated results', () => {
      let seed = 42
      const random = () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
        return seed / 2_147_483_648
      }
      const pool = Array.from({ length: 12 }, (_, index) => `id-${index}`)

      for (let run = 0; run < 200; run += 1) {
        const build = () => pool
          .filter(() => random() > 0.4)
          .map(id => ({ id, value: Math.floor(random() * 3) }))
          .toSorted(() => (random() > 0.5 ? 1 : -1))
        const previous = build()
        const next = build()
        const delta = diffQueryResults(previous, next)
        expect(applyQueryDelta(previous, delta)).toEqual(next)
      }
    })

    it('should not mutate the previous result', () => {
      const previous = items('a', 'b', 'c')
      const snapshot = [...previous]
      applyQueryDelta(previous, diffQueryResults(previous, items('c', 'a')))
      expect(previous).toEqual(snapshot)
    })
  })

  describe('shortcuts it takes', () => {
    it('should report nothing for the very same array', () => {
      const previous = items('a', 'b', 'c')
      expect(isEmptyQueryDelta(diffQueryResults(previous, previous))).toBe(true)
    })

    it('should report nothing for an array holding the very same items', () => {
      const previous = items('a', 'b', 'c')
      expect(isEmptyQueryDelta(diffQueryResults(previous, [...previous]))).toBe(true)
    })

    it('should report no moves when the surviving items kept their order', () => {
      const previous = items('a', 'b', 'c', 'd')
      const delta = diffQueryResults(previous, [
        { id: 'x' }, previous[0], previous[2], { id: 'y' }, previous[3],
      ])
      expect(delta.moved).toEqual([])
      expect(delta.removed).toEqual(['b'])
      expect(delta.added.map(entry => entry.item.id)).toEqual(['x', 'y'])
    })

    it('should still report moves when the surviving items were reordered', () => {
      const previous = items('a', 'b', 'c', 'd')
      const delta = diffQueryResults(previous, [
        previous[3], previous[0], previous[1], previous[2],
      ])
      expect(delta.moved).toHaveLength(1)
      expect(applyQueryDelta(previous, delta)).toEqual([
        previous[3], previous[0], previous[1], previous[2],
      ])
    })
  })

  describe('canApplyQueryDelta', () => {
    const previous = items('a', 'b', 'c')
    const base = { added: [], changed: [], removed: [], moved: [], resultCount: 3 }

    it('should accept a delta computed from the result it is applied to', () => {
      const cases: Item[][] = [
        items('a', 'b', 'c'),
        items('a', 'b'),
        items('c', 'b', 'a'),
        items('a', 'b', 'c', 'd'),
        [],
      ]
      cases.forEach((next) => {
        expect(canApplyQueryDelta(previous, diffQueryResults(previous, next))).toBe(true)
      })
    })

    it('should reject a removal of an item that is not there', () => {
      expect(canApplyQueryDelta(previous, { ...base, removed: ['z'], resultCount: 2 })).toBe(false)
    })

    it('should reject a change to an item that is not there', () => {
      expect(canApplyQueryDelta(previous, { ...base, changed: [{ id: 'z' }] })).toBe(false)
    })

    it('should reject a move of an item that is not there', () => {
      expect(canApplyQueryDelta(previous, { ...base, moved: [{ index: 0, id: 'z' }] })).toBe(false)
    })

    it('should reject an addition of an item that is already there', () => {
      expect(canApplyQueryDelta(previous, {
        ...base,
        added: [{ index: 0, item: { id: 'a' } }],
        resultCount: 4,
      })).toBe(false)
    })

    it('should reject a delta whose result count does not add up', () => {
      expect(canApplyQueryDelta(previous, { ...base, removed: ['a'], resultCount: 3 })).toBe(false)
    })

    it('should reject an index outside the resulting array', () => {
      expect(canApplyQueryDelta(previous, {
        ...base,
        added: [{ index: 9, item: { id: 'd' } }],
        resultCount: 4,
      })).toBe(false)
      expect(canApplyQueryDelta(previous, {
        ...base,
        moved: [{ index: -1, id: 'a' }],
      })).toBe(false)
    })

    it('should reject the same id appearing twice', () => {
      expect(canApplyQueryDelta(previous, { ...base, removed: ['a', 'a'], resultCount: 1 }))
        .toBe(false)
    })
  })

  describe('isEmptyQueryDelta', () => {
    it('should recognize a delta that changes nothing', () => {
      expect(isEmptyQueryDelta({
        added: [], changed: [], removed: [], moved: [], resultCount: 0,
      })).toBe(true)
    })

    it('should recognize a delta that changes something', () => {
      expect(isEmptyQueryDelta({
        added: [], changed: [{ id: 'a' }], removed: [], moved: [], resultCount: 1,
      })).toBe(false)
      expect(isEmptyQueryDelta({
        added: [{ index: 0, item: { id: 'a' } }], changed: [], removed: [], moved: [], resultCount: 1,
      })).toBe(false)
      expect(isEmptyQueryDelta({
        added: [], changed: [], removed: ['a'], moved: [], resultCount: 0,
      })).toBe(false)
      expect(isEmptyQueryDelta({
        added: [], changed: [], removed: [], moved: [{ index: 0, id: 'a' }], resultCount: 1,
      })).toBe(false)
    })
  })
})
