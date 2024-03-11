import { describe, it, expect } from 'vitest'
import getMatchingKeys from './getMatchingKeys'

describe('getMatchingKeys', () => {
  it('should return null if the selector field is an instance of RegExp', () => {
    const field = 'name'
    const selector = { name: /John/ }

    const result = getMatchingKeys(field, selector)

    expect(result).toBeNull()
  })

  it('should return null if the selector field is null or undefined', () => {
    const field = 'name'
    const selector1 = { name: null }
    const selector2 = { name: undefined }

    const result1 = getMatchingKeys(field, selector1)
    const result2 = getMatchingKeys(field, selector2)

    expect(result1).toBeNull()
    expect(result2).toBeNull()
  })

  it('should return an array of matching keys if the selector field is a single value', () => {
    const field = 'name'
    const selector = { name: 'John' }

    const result = getMatchingKeys(field, selector)

    expect(result).toEqual(['John'])
  })

  it('should return an array of matching keys if the selector field is an $in expression', () => {
    const field = 'name'
    const selector = { name: { $in: ['John', 'Jane'] } }

    const result = getMatchingKeys(field, selector)

    expect(result).toEqual(['John', 'Jane'])
  })
})
