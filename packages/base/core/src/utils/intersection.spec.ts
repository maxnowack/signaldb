import { describe, it, expect } from 'vitest'
import intersection from './intersection'

describe('intersection', () => {
  it('should return an empty array when given no arguments', () => {
    expect(intersection()).toEqual([])
  })

  it('should return an empty array when given empty arrays', () => {
    expect(intersection([], [], [])).toEqual([])
  })

  it('should return the intersection of two arrays', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3])
  })

  it('should return the intersection of multiple arrays', () => {
    expect(intersection([1, 2, 3], [2, 3, 4], [3, 4, 5])).toEqual([3])
  })

  it('should return the intersection of arrays with duplicate values', () => {
    expect(intersection([1, 2, 2, 3], [2, 2, 3, 4])).toEqual([2, 3])
  })

  it('should return the intersection of arrays with non-unique objects', () => {
    const object1 = { id: 1, name: 'Alice' }
    const object2 = { id: 2, name: 'Bob' }
    const object3 = { id: 3, name: 'Charlie' }
    expect(intersection([object1, object2], [object2, object3])).toEqual([object2])
  })
})
