import { describe, it, expect } from 'vitest'
import isEqual from './isEqual'

describe('isEqual', () => {
  it('should return true for equal primitive values', () => {
    expect(isEqual(5, 5)).toBe(true)
    expect(isEqual('hello', 'hello')).toBe(true)
    expect(isEqual(true, true)).toBe(true)
  })

  it('should return true for equal RegExp objects', () => {
    const regex1 = /[a-z]+/
    const regex2 = /[a-z]+/
    expect(isEqual(regex1, regex2)).toBe(true)
  })

  it('should return true for equal Date objects', () => {
    const date1 = new Date('2022-01-01')
    const date2 = new Date('2022-01-01')
    expect(isEqual(date1, date2)).toBe(true)
  })

  it('should return true for equal objects', () => {
    const object1 = { a: 1, b: 2 }
    const object2 = { a: 1, b: 2 }
    expect(isEqual(object1, object2)).toBe(true)
  })

  it('should return false for non-equal values', () => {
    expect(isEqual(5, 10)).toBe(false)
    expect(isEqual('hello', 'world')).toBe(false)
    expect(isEqual(true, false)).toBe(false)
    expect(isEqual({}, null)).toBe(false)
    expect(isEqual(null as unknown as Record<string, unknown>, {})).toBe(false)
    expect(isEqual({ a: 1 }, { b: 2 })).toBe(false)
    expect(isEqual({}, {})).toBe(true)
    expect(isEqual({ test: true }, {})).toBe(false)
    expect(isEqual({}, { test: true })).toBe(false)
  })
})
