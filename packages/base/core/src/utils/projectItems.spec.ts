import { describe, expect, it } from 'vitest'
import projectItems from './projectItems'

describe('projectItems', () => {
  it('should return the items untouched without a projection', () => {
    const items = [{ id: 'a', name: 'Anna', age: 30 }]
    expect(projectItems(items, undefined)).toBe(items)
  })

  it('should keep the id alongside the included fields', () => {
    expect(projectItems([{ id: 'a', name: 'Anna', age: 30 }], { name: 1 }))
      .toEqual([{ id: 'a', name: 'Anna' }])
  })

  it('should drop the id when the projection excludes it', () => {
    expect(projectItems([{ id: 'a', name: 'Anna', age: 30 }], { id: 0, age: 0 }))
      .toEqual([{ name: 'Anna' }])
  })

  it('should remove excluded fields and keep the rest', () => {
    expect(projectItems([{ id: 'a', name: 'Anna', age: 30 }], { age: 0 }))
      .toEqual([{ id: 'a', name: 'Anna' }])
  })

  it('should project every item', () => {
    expect(projectItems([{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }], { name: 1 }))
      .toEqual([{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }])
  })
})
