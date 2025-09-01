import { describe, it, expect } from 'vitest'
import modify from './modify'

describe('modify', () => {
  it('applies $set operations on a cloned object', () => {
    const item = { a: 1 }
    const modifier = { $set: { a: 2, b: 3 } }
    const result = modify(item, modifier)
    expect(result).toEqual({ a: 2, b: 3 })
    expect(result).not.toBe(item)
    expect(item).toEqual({ a: 1 })
  })

  it('applies $unset operations on a cloned object', () => {
    const item = { a: 1, b: 2 }
    const modifier = { $unset: { b: '' } }
    const result = modify(item, modifier)
    expect(result).toEqual({ a: 1 })
    expect(result).not.toBe(item)
    expect(item).toEqual({ a: 1, b: 2 })
  })
})
