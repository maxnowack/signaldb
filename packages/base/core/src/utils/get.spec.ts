import { describe, it, expect } from 'vitest'
import get from './get'

describe('get', () => {
  const testObject = {
    a: {
      b: {
        c: 'inner value',
      },
      d: [1, 2, 3],
      e: null,
      f: undefined,
    },
  }

  it('retrieves deeply nested value', () => {
    const value = get(testObject, 'a.b.c')
    expect(value).toBe('inner value')
  })

  it('retrieves value from array', () => {
    const value = get(testObject, 'a.d[1]')
    expect(value).toBe(2)
  })

  it('retrieves value from nested array path', () => {
    const nested = { a: [{ b: { c: 5 } }] }
    const value = get(nested, 'a[0].b.c')
    expect(value).toBe(5)
  })

  it('retrieves null value', () => {
    const value = get(testObject, 'a.e')
    expect(value).toBeNull()
  })

  it('retrieves undefined value', () => {
    const value = get(testObject, 'a.f')
    expect(value).toBeUndefined()
  })

  it('returns undefined for non-existing path', () => {
    const value = get(testObject, 'a.b.nonExisting')
    expect(value).toBeUndefined()
  })

  it('returns undefined for incorrect path format', () => {
    const value = get(testObject, 'a..b')
    expect(value).toBeUndefined()
  })

  it('returns undefined for incorrect path format with array', () => {
    const value = get(testObject, 'a.d.[1]')
    expect(value).toBeUndefined()
  })

  it('returns undefined when encountering null on the path', () => {
    const value = get(testObject, 'a.e.some')
    expect(value).toBeUndefined()
  })

  it('returns undefined for path longer than object depth', () => {
    const value = get(testObject, 'a.b.c.d')
    expect(value).toBeUndefined()
  })
})
