import { describe, it, expect } from 'vitest'
import compact from './compact'

describe('compact', () => {
  it('should remove falsy values from an array', () => {
    const array = [0, 1, false, 2, '', 3]
    const result = compact(array)
    expect(result).toEqual([1, 2, 3])
  })

  it('should return an empty array if all values are falsy', () => {
    const array = [false, null, undefined, 0, Number.NaN, '']
    const result = compact(array)
    expect(result).toEqual([])
  })

  it('should return a copy of the original array if all values are truthy', () => {
    const array = [1, 'hello', true]
    const result = compact(array)
    expect(result).toEqual(array)
    expect(result).not.toBe(array)
  })
})
