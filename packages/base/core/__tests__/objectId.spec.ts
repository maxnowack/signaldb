import { describe, it, expect } from 'vitest'
import objectId from '../src/utils/objectId'

describe('objectId', () => {
  it('returns stable id for same object', () => {
    const object = { a: 1 }
    const id1 = objectId(object)
    const id2 = objectId(object)
    expect(id1).toBe(id2)
  })

  it('returns different ids for different objects', () => {
    const a = { a: 1 }
    const b = { b: 2 }
    const idA = objectId(a)
    const idB = objectId(b)
    expect(idA).not.toBe(idB)
  })

  it('works with arrays (objects)', () => {
    const array: unknown[] = []
    const id1 = objectId(array as object)
    const id2 = objectId(array as object)
    expect(id1).toBe(id2)
  })

  it('throws on null', () => {
    expect(() => objectId(null as unknown as object)).toThrow(TypeError)
    expect(() => objectId(null as unknown as object)).toThrow('Expected a non-null object')
  })

  it('throws on non-object primitives', () => {
    expect(() => objectId(123 as unknown as object)).toThrow(TypeError)
    expect(() => objectId('x' as unknown as object)).toThrow(TypeError)
    expect(() => objectId(true as unknown as object)).toThrow(TypeError)
    expect(() => objectId(Symbol('s') as unknown as object)).toThrow(TypeError)
  })

  it('throws on functions (not typeof object)', () => {
    const fn = () => {}
    expect(() => objectId(fn as unknown as object)).toThrow(TypeError)
  })
})
