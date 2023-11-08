import { describe, it, expect } from 'vitest'
import { getMatchingIds } from './createIdIndex'

describe('getMatchingIds', () => {
  it('should return null if selector.id is a RegExp', () => {
    const selector = { id: /test/ }
    const result = getMatchingIds(selector)
    expect(result).toBeNull()
  })

  it("should return an array with selector.id if it's not null and not a field expression", () => {
    const selector = { id: 'test' }
    const result = getMatchingIds(selector)
    expect(result).toEqual(['test'])
  })

  it("should return an array with selector.id.$in if it's a field expression with $in", () => {
    const selector = { id: { $in: ['test1', 'test2'] } }
    const result = getMatchingIds(selector)
    expect(result).toEqual(['test1', 'test2'])
  })

  it("should return an array with selector.id if it's a field expression without $in", () => {
    const selector = { id: { $ne: 'test' } }
    const result = getMatchingIds(selector)
    expect(result).toBeNull()
  })

  it('should return null if selector.$and is an empty array', () => {
    const selector = { $and: [] }
    const result = getMatchingIds(selector)
    expect(result).toBeNull()
  })

  it('should return the intersection of sub-arrays if selector.$and is an array of selectors', () => {
    expect(getMatchingIds({
      $and: [
        { id: 'test1' },
        { name: 'John' },
      ],
    })).toEqual(['test1'])

    expect(getMatchingIds({
      $and: [
        { id: 'test1' },
        { id: { $in: ['test1', 'test2'] } },
        { id: { $ne: 'test2' } },
      ],
    })).toEqual(['test1'])
  })
})
