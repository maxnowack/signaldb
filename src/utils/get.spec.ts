import get from './get'

describe('get', () => {
  const testObj = {
    a: {
      b: {
        c: 'inner value',
      },
      d: [1, 2, 3],
      e: null,
      f: undefined,
    },
  }

  test('retrieves deeply nested value', () => {
    const value = get(testObj, 'a.b.c')
    expect(value).toEqual('inner value')
  })

  test('retrieves value from array', () => {
    const value = get(testObj, 'a.d[1]')
    expect(value).toEqual(2)
  })

  test('retrieves null value', () => {
    const value = get(testObj, 'a.e')
    expect(value).toBeNull()
  })

  test('retrieves undefined value', () => {
    const value = get(testObj, 'a.f')
    expect(value).toBeUndefined()
  })

  test('returns undefined for non-existing path', () => {
    const value = get(testObj, 'a.b.nonExisting')
    expect(value).toBeUndefined()
  })

  test('returns undefined for incorrect path format', () => {
    const value = get(testObj, 'a..b')
    expect(value).toBeUndefined()
  })

  test('returns undefined for incorrect path format with array', () => {
    const value = get(testObj, 'a.d.[1]')
    expect(value).toBeUndefined()
  })

  test('returns undefined for path longer than object depth', () => {
    const value = get(testObj, 'a.b.c.d')
    expect(value).toBeUndefined()
  })
})
