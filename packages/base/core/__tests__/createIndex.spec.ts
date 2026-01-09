import { describe, it, expect } from 'vitest'
import createIndex from '../src/createIndex'

interface Item {
  id: string,
  status?: string | null,
}

const baseItems: Item[] = [
  { id: '1', status: 'open' },
  { id: '2', status: 'closed' },
  { id: '3', status: 'open' },
  { id: '4', status: null },
]

describe('createIndex', () => {
  it('returns matches for direct selectors and ignores missing fields', () => {
    const index = createIndex<Item>('status')
    index.rebuild(baseItems)

    expect(index.query({}).matched).toBe(false)
    const result = index.query({ status: 'open' })
    expect(result).toEqual({
      matched: true,
      ids: ['1', '3'],
      fields: ['status'],
      keepSelector: false,
    })
  })

  it('applies exclusion filters and keeps selector when querying for null', () => {
    const index = createIndex<Item>('status')
    index.rebuild(baseItems)

    const excludesClosed = index.query({ status: { $nin: ['closed'] } as any })
    expect(excludesClosed.ids).toEqual(expect.arrayContaining(['1', '3', '4']))
    expect(excludesClosed.ids).not.toContain('2')

    const onlyNull = index.query({ status: null })
    expect(onlyNull.keepSelector).toBe(true)
    expect(onlyNull.ids).toEqual(['4'])
  })

  it('supports delta operations insert/remove/update', () => {
    const index = createIndex<Item>('status')
    index.rebuild([{ id: '1', status: 'open' }])

    index.insert([{ id: '2', status: 'open' }])
    index.insert([{ id: '3', status: 'closed' }])

    index.update([
      { oldItem: { id: '2', status: 'open' }, newItem: { id: '2', status: 'open' } },
      { oldItem: { id: '1', status: 'open' }, newItem: { id: '1', status: 'closed' } },
    ])

    index.remove([{ id: '3', status: 'closed' }])

    const closedResult = index.query({ status: 'closed' })
    expect(closedResult.ids).toEqual(['1'])
    expect(closedResult.fields).toEqual(['status'])
  })
})
