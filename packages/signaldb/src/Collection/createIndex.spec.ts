import { describe, it, expect } from 'vitest'
import { getMatchingKeys, serializeValue } from './createIndex'

describe('serializeValue', () => {
  it('should serialize a string value correctly', () => {
    expect(serializeValue('hello')).toBe('hello')
  })

  it('should serialize a number value correctly', () => {
    expect(serializeValue(42)).toBe('42')
  })

  it('should serialize a boolean value correctly', () => {
    expect(serializeValue(true)).toBe('true')
  })

  it('should serialize a Date value correctly', () => {
    expect(serializeValue(new Date('2022-01-01T00:00:00Z'))).toBe('2022-01-01T00:00:00.000Z')
  })

  it('should serialize an object value correctly', () => {
    expect(serializeValue({ name: 'John', age: 30 })).toBe('{"name":"John","age":30}')
  })
})

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

    expect(result).toEqual({
      keys: ['John'],
      optimizedSelector: {},
    })
  })

  it('should return an array of matching keys if the selector field is an $in expression', () => {
    const field = 'name'
    const selector = { name: { $in: ['John', 'Jane'] } }

    const result = getMatchingKeys(field, selector)

    expect(result).toEqual({
      keys: ['John', 'Jane'],
      optimizedSelector: {},
    })
  })

  it('should return an array of matching keys if the selector field is nested within $and expression', () => {
    const field = 'name'
    const selector = {
      $and: [
        { name: 'John' },
        { name: 'Jane' },
      ],
    }

    const result = getMatchingKeys(field, selector)

    expect(result).toEqual({
      keys: [],
      optimizedSelector: {},
    })
  })

  it('should return an array of matching keys if the selector field is nested within $or expression', () => {
    const field = 'name'
    const selector = {
      $or: [
        { name: 'John' },
        { name: 'Jane' },
      ],
    }

    const result = getMatchingKeys(field, selector)

    expect(result).toEqual({
      keys: ['John', 'Jane'],
      optimizedSelector: {},
    })
  })

  it('should return matching keys in nested expressions', () => {
    const field = 'name'
    const selector = {
      $and: [
        { name: 'John' },
        { age: 30 },
      ],
    }

    const result = getMatchingKeys(field, selector)

    expect(result).toEqual({
      keys: ['John'],
      optimizedSelector: {
        $and: [{ age: 30 }],
      },
    })
  })
})
