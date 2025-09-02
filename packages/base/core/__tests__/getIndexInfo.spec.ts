import { describe, it, expect } from 'vitest'
import getIndexInfo, { getMergedIndexInfo } from '../src/getIndexInfo'
import type { BaseItem } from '../src/Collection'
import type { IndexResult, SynchronousQueryFunction, AsynchronousQueryFunction } from '../src/types/IndexProvider'
import type Selector from '../src/types/Selector'
import type { FlatSelector } from '../src/types/Selector'

type Item = BaseItem<string> & { a?: number, b?: number }

const matchAll: IndexResult<string> = { matched: true, ids: ['1', '2'], fields: ['a'], keepSelector: false }
const matchSubset: IndexResult<string> = { matched: true, ids: ['2'], fields: ['b'], keepSelector: false }
const noMatch: IndexResult<string> = { matched: false }

describe('getIndexInfo', () => {
  it('returns default info for empty selector', () => {
    const p1: SynchronousQueryFunction<Item, string> = () => matchAll
    const info = getIndexInfo([p1], {} as unknown as Selector<Item>)
    expect(info.matched).toBe(false)
    expect(info.ids).toEqual([])
  })

  it('merges sync providers and removes optimized fields', () => {
    const p1: SynchronousQueryFunction<Item, string> = () => matchAll
    const p2: SynchronousQueryFunction<Item, string> = () => matchSubset
    const info = getIndexInfo([p1, p2], { a: 1, b: 2 } as unknown as Selector<Item>)
    expect(info.matched).toBe(true)
    expect(info.ids).toEqual(['2'])
    // optimized selector should be empty after removing both fields
    expect(Object.keys(info.optimizedSelector).length).toBe(0)
  })

  it('supports async providers and $and / $or logic gates', async () => {
    const asyncProvider: AsynchronousQueryFunction<Item, string> = async () => matchAll
    const info = await getIndexInfo(
      [asyncProvider],
      { $and: [{ a: 1 }], $or: [{ b: 2 }, { c: 3 }], d: 4 } as unknown as Selector<Item>,
    )
    expect(info.matched).toBe(true)
    expect(Array.isArray(info.ids)).toBe(true)
  })

  it('throws when mixing sync/async in getMergedIndexInfo', () => {
    const sync: SynchronousQueryFunction<Item, string> = () => noMatch
    const asyncP: AsynchronousQueryFunction<Item, string> = async () => matchAll
    const flatSel = { a: 1 } as unknown as FlatSelector<Item>
    expect(() => getMergedIndexInfo([asyncP, sync], flatSel)).toThrow('Mixing async and sync index providers is not supported')
  })
})
