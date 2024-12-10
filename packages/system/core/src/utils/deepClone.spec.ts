import { describe, it, expect } from 'vitest'
import deepClone, { clone } from './deepClone'

describe('deepClone', () => {
  it('should use the polyfill when structuredClone is not available', () => {
    const obj = { a: 1, b: { c: 2 } }
    expect(deepClone(obj)).not.toBe(obj)
    expect(deepClone(obj)).toEqual({ a: 1, b: { c: 2 } })
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
    const arr = [1, 2, 3, [4, 5]]
    const clonedArr = clone(arr)
    expect(clonedArr).toEqual(arr)
    expect(clonedArr).not.toBe(arr)
    expect(clonedArr[3]).not.toBe(arr[3])
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
    const obj = { a: 1, b: { c: 2 } }
    const clonedObj = clone(obj)
    expect(clonedObj).toEqual(obj)
    expect(clonedObj).not.toBe(obj)
    expect(clonedObj.b).not.toBe(obj.b)
  })

  it('should clone complex objects correctly', () => {
    const complexObj = {
      a: 1,
      b: [2, 3],
      c: new Map([['key', 'value']]),
      d: new Set([4, 5]),
      e: new Date(),
      f: { g: 6 },
      g: /asdf/gi,
    }
    const clonedComplexObj = clone(complexObj)
    expect(clonedComplexObj).toEqual(complexObj)
    expect(clonedComplexObj).not.toBe(complexObj)
    expect(clonedComplexObj.b).not.toBe(complexObj.b)
    expect(clonedComplexObj.c).not.toBe(complexObj.c)
    expect(clonedComplexObj.d).not.toBe(complexObj.d)
    expect(clonedComplexObj.e).not.toBe(complexObj.e)
    expect(clonedComplexObj.f).not.toBe(complexObj.f)
    expect(clonedComplexObj.g).not.toBe(complexObj.g)
  })

  it('should fail on functions', () => {
    expect(() => clone(() => {})).toThrowError('Cloning functions is not supported')
  })
})
