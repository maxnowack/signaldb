import set from 'utils/set'

describe('set', () => {
  it('should set the value at the specified path in the object', () => {
    const obj = { foo: { bar: { baz: 'initial' } } }
    const result = set(obj, 'foo.bar.baz', 'updated')
    expect(result).toEqual({ foo: { bar: { baz: 'updated' } } })
  })

  it('should create nested objects if they do not exist', () => {
    const obj = { foo: {} }
    const result = set(obj, 'foo.bar.baz', 'value')
    expect(result).toEqual({ foo: { bar: { baz: 'value' } } })
  })

  it('should create nested arrays if they do not exist', () => {
    const obj = { foo: {} }
    const result = set(obj, 'foo.bar[0]', 'value')
    expect(result).toEqual({ foo: { bar: ['value'] } })
  })

  it('should handle array indices in path', () => {
    const obj = { arr: [] }
    const result = set(obj, 'arr[2]', 'value')
    expect(result).toEqual({ arr: [undefined, undefined, 'value'] })
  })

  it('should return the same object reference', () => {
    const obj = { foo: 'bar' }
    const result = set(obj, 'foo', 'baz')
    expect(result).toBe(obj)
  })
})
