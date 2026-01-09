import { describe, it, expect } from 'vitest'
import set from './set'

describe('set', () => {
  it('should set the value at the specified path in the object', () => {
    const object = { foo: { bar: { baz: 'initial' } } }
    const result = set(object, 'foo.bar.baz', 'updated')
    expect(result).toEqual({ foo: { bar: { baz: 'updated' } } })
  })

  it('should create nested objects if they do not exist', () => {
    const object = { foo: {} }
    const result = set(object, 'foo.bar.baz', 'value')
    expect(result).toEqual({ foo: { bar: { baz: 'value' } } })
  })

  it('should create nested arrays if they do not exist', () => {
    const object = { foo: {} }
    const result = set(object, 'foo.bar[0]', 'value')
    expect(result).toEqual({ foo: { bar: ['value'] } })
  })

  it('should handle array indices in path', () => {
    const object = { arr: [] }
    const result = set(object, 'arr[2]', 'value')
    expect(result).toEqual({ arr: [undefined, undefined, 'value'] })
  })

  it('should return the same object reference', () => {
    const object = { foo: 'bar' }
    const result = set(object, 'foo', 'baz')
    expect(result).toBe(object)
  })

  it('should delete the property if the value is undefined', () => {
    const object = { foo: 'bar', bar: 'baz' }
    const result = set(object, 'foo', undefined, true)
    expect(result).toEqual({ bar: 'baz' })
  })

  it('should return the original value when object is nullish', () => {
    expect(set(null as unknown as Record<string, unknown>, 'foo', 'bar')).toBeNull()
  })

  it('should support bracket paths when deleting values', () => {
    const object = { foo: [{ bar: 'baz', keep: true }] }
    const result = set(object, 'foo[0].bar', undefined, true)
    expect(Array.isArray(result.foo)).toBe(true)
    expect(result.foo[0]).toHaveProperty('keep', true)
    expect(result.foo[0]).toHaveProperty('', {})
  })
})
