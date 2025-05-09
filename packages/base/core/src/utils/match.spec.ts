import { describe, it, expect } from 'vitest'
import match from './match'

describe('match', () => {
  it('should match an item that satisfies the selector', () => {
    const item = { name: 'John', age: 30, hobbies: ['reading', 'gaming'] }
    const selector = { name: 'John' }
    expect(match(item, selector)).toBe(true)
  })

  it('should not match an item that does not satisfy the selector', () => {
    const item = { name: 'John', age: 30 }
    const selector = { name: 'Jane' }
    expect(match(item, selector)).toBe(false)
  })

  it('should match using comparison operators', () => {
    const item = { age: 30 }
    expect(match(item, { age: { $gt: 20 } })).toBe(true)
    expect(match(item, { age: { $lt: 40 } })).toBe(true)
    expect(match(item, { age: { $gte: 30 } })).toBe(true)
    expect(match(item, { age: { $lte: 30 } })).toBe(true)
    expect(match(item, { age: { $ne: 25 } })).toBe(true)
  })

  it('should match with logical operators', () => {
    const item = { name: 'John', age: 30 }
    expect(match(item, { $and: [{ name: 'John' }, { age: 30 }] })).toBe(true)
    expect(match(item, { $or: [{ name: 'Jane' }, { age: 30 }] })).toBe(true)
    expect(match(item, { $nor: [{ name: 'Jane' }, { age: 40 }] })).toBe(true)
  })

  it('should match with array operators', () => {
    const item = { hobbies: ['reading', 'gaming', 'hiking'] }
    expect(match(item, { hobbies: { $in: ['gaming'] } })).toBe(true)
    expect(match(item, { hobbies: { $nin: ['swimming'] } })).toBe(true)
    expect(match(item, { hobbies: { $all: ['reading', 'gaming'] } })).toBe(true)
    expect(match(item, { hobbies: { $size: 3 } })).toBe(true)
  })

  it('should handle nested objects', () => {
    const item = { user: { name: 'John', profile: { age: 30 } } }
    expect(match(item, { 'user.name': 'John' })).toBe(true)
    expect(match(item, { 'user.profile.age': 30 })).toBe(true)
    expect(match(item, { 'user.profile.age': { $gt: 25 } })).toBe(true)
  })

  it('should handle $exists operator', () => {
    expect(match({ name: 'John' }, { name: { $exists: true } })).toBe(true)
    expect(match({} as { name?: string }, { name: { $exists: false } })).toBe(true)
    expect(match({ name: undefined }, { name: { $exists: false } })).toBe(true)
    expect(match({ name: null }, { name: { $exists: false } })).toBe(false)
  })

  it('should handle null and undefined values', () => {
    expect(match({ name: null }, { name: null })).toBe(true)
    expect(match({ name: undefined }, { name: undefined })).toBe(true)
    expect(match({ name: null }, { name: { $ne: null } })).toBe(false)
    expect(match({ name: null }, { name: { $ne: undefined } })).toBe(false)
    expect(match({ name: undefined }, { name: { $ne: undefined } })).toBe(false)
    expect(match({ name: undefined as null | undefined }, { name: { $ne: null } })).toBe(false)
    expect(match({ name: undefined as null | undefined }, { name: null })).toBe(true)
  })
})
