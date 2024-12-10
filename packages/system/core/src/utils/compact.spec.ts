import { describe, it, expect } from 'vitest'
import compact from './compact'

describe('compact', () => {
  it('should remove falsy values from an array', () => {
    const arr = [0, 1, false, 2, '', 3]
    const result = compact(arr)
    expect(result).toEqual([1, 2, 3])
  })

  it('should return an empty array if all values are falsy', () => {
    const arr = [false, null, undefined, 0, NaN, '']
    const result = compact(arr)
    expect(result).toEqual([])
  })

  it('should return a copy of the original array if all values are truthy', () => {
    const arr = [1, 'hello', true]
    const result = compact(arr)
    expect(result).toEqual(arr)
    expect(result).not.toBe(arr)
  })
})
