import { describe, it, expect } from 'vitest'
import sortItems from './sortItems'

describe('sortItems', () => {
  type Item = { id: number, name: string, age: number };

  it('should sort items in ascending order based on id', () => {
    const items: Item[] = [
      { id: 3, name: 'Alice', age: 25 },
      { id: 1, name: 'Bob', age: 30 },
      { id: 2, name: 'Charlie', age: 35 },
    ]
    const result = sortItems(items, { id: 1 })
    expect(result).toEqual([
      { id: 1, name: 'Bob', age: 30 },
      { id: 2, name: 'Charlie', age: 35 },
      { id: 3, name: 'Alice', age: 25 },
    ])
  })

  it('should sort items in descending order based on age', () => {
    const items: Item[] = [
      { id: 3, name: 'Alice', age: 25 },
      { id: 1, name: 'Bob', age: 30 },
      { id: 2, name: 'Charlie', age: 35 },
    ]
    const result = sortItems(items, { age: -1 })
    expect(result).toEqual([
      { id: 2, name: 'Charlie', age: 35 },
      { id: 1, name: 'Bob', age: 30 },
      { id: 3, name: 'Alice', age: 25 },
    ])
  })

  it('should sort items in ascending order based on name', () => {
    const items: Item[] = [
      { id: 3, name: 'Alice', age: 25 },
      { id: 1, name: 'Bob', age: 30 },
      { id: 2, name: 'Charlie', age: 35 },
    ]
    const result = sortItems(items, { name: 1 })
    expect(result).toEqual([
      { id: 3, name: 'Alice', age: 25 },
      { id: 1, name: 'Bob', age: 30 },
      { id: 2, name: 'Charlie', age: 35 },
    ])
  })
})
