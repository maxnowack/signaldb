import { describe, it, expect } from 'vitest'
import deepClone, { clone } from './deepClone'

describe('deepClone', () => {
  it('should use the polyfill when structuredClone is not available', () => {
    const originalStructuredClone = globalThis.structuredClone
    globalThis.structuredClone = undefined as unknown as typeof globalThis.structuredClone
    const object = { a: 1, b: { c: 2 } }
    const cloned = deepClone(object)
    expect(cloned).not.toBe(object)
    expect(cloned).toEqual({ a: 1, b: { c: 2 } })
    // restore
    globalThis.structuredClone = originalStructuredClone
  })
})

describe('clone', () => {
  it('should clone primitive types correctly', () => {
    expect(clone(null)).toBeNull()
    expect(clone(undefined)).toBeUndefined()
    expect(clone(123)).toBe(123)
    expect(clone('test')).toBe('test')
    expect(clone(true)).toBe(true)
  })

  it('should clone arrays correctly', () => {
    const array = [1, 2, 3, [4, 5]]
    const clonedArray = clone(array)
    expect(clonedArray).toEqual(array)
    expect(clonedArray).not.toBe(array)
    expect(clonedArray[3]).not.toBe(array[3])
  })

  it('should clone maps correctly', () => {
    const map = new Map([['key1', 'value1'], ['key2', 'value2']])
    const clonedMap = clone(map)
    expect(clonedMap).toEqual(map)
    expect(clonedMap).not.toBe(map)
  })

  it('should clone sets correctly', () => {
    const set = new Set([1, 2, 3])
    const clonedSet = clone(set)
    expect(clonedSet).toEqual(set)
    expect(clonedSet).not.toBe(set)
  })

  it('should clone dates correctly', () => {
    const date = new Date()
    const clonedDate = clone(date)
    expect(clonedDate).toEqual(date)
    expect(clonedDate).not.toBe(date)
  })

  it('should clone plain objects correctly', () => {
    const object = { a: 1, b: { c: 2 } }
    const clonedObject = clone(object)
    expect(clonedObject).toEqual(object)
    expect(clonedObject).not.toBe(object)
    expect(clonedObject.b).not.toBe(object.b)
  })

  it('should ignore inherited properties', () => {
    const proto = { inherited: true }
    const object = Object.create(proto)
    object.own = true
    const cloned = clone(object)
    expect(cloned).toEqual({ own: true })
    expect(cloned).not.toHaveProperty('inherited')
  })

  it('should clone complex objects correctly', () => {
    const complexObject = {
      a: 1,
      b: [2, 3],
      c: new Map([['key', 'value']]),
      d: new Set([4, 5]),
      e: new Date(),
      f: { g: 6 },
      g: /asdf/gi,
    }
    const clonedComplexObject = clone(complexObject)
    expect(clonedComplexObject).toEqual(complexObject)
    expect(clonedComplexObject).not.toBe(complexObject)
    expect(clonedComplexObject.b).not.toBe(complexObject.b)
    expect(clonedComplexObject.c).not.toBe(complexObject.c)
    expect(clonedComplexObject.d).not.toBe(complexObject.d)
    expect(clonedComplexObject.e).not.toBe(complexObject.e)
    expect(clonedComplexObject.f).not.toBe(complexObject.f)
    expect(clonedComplexObject.g).not.toBe(complexObject.g)
  })

  it('should fail on functions', () => {
    expect(() => clone(() => {})).toThrowError('Cloning functions is not supported')
  })
})
