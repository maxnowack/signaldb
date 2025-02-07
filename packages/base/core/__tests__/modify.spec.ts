import { describe, expect, it } from 'vitest'
import modify from '../src/utils/modify'

describe('modify', () => {
  it('should apply modifier with default options', () => {
    const item = { a: 1, b: 2 }
    const modifier = { $set: { b: 3, c: 4 } }
    const result = modify(item, modifier)
    expect(result).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('should apply modifier with custom options', () => {
    const item = { a: 1, b: 2 }
    const modifier = { $set: { b: 3, c: 4 } }
    const result = modify(item, modifier)
    expect(result).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('should apply modifier with array filters', () => {
    const item = { a: 1, b: [{ x: 1 }, { x: 2 }] }
    const modifier = { $set: { 'b.$[elem].x': 3 } }
    const arrayFilters = [{ 'elem.x': 2 }]
    const result = modify(item, modifier, arrayFilters)
    expect(result).toEqual({ a: 1, b: [{ x: 1 }, { x: 3 }] })
  })
})
