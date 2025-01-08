import { it, expect } from 'vitest'
import uniqueBy from './uniqueBy'

it('uniqueBy should return an array with unique items based on the provided key', () => {
  const array = [
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
    { id: 3, name: 'John' },
    { id: 4, name: 'Jane' },
  ]

  const result = uniqueBy(array, 'name')
  expect(result).toEqual([
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
  ])
})

it('uniqueBy should return an array with unique items based on the provided function', () => {
  const array = [
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
    { id: 3, name: 'John' },
    { id: 4, name: 'Jane' },
  ]

  const result = uniqueBy(array, item => item.name)
  expect(result).toEqual([
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
  ])
})

it('uniqueBy should preserve the order of the unique items', () => {
  const array = [
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
    { id: 3, name: 'John' },
    { id: 4, name: 'Jane' },
  ]

  const result = uniqueBy(array, 'name')
  expect(result).toEqual([
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
  ])
  expect(result[0]).toBe(array[0])
  expect(result[1]).toBe(array[1])
})
