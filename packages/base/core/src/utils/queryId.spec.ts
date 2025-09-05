import { describe, expect, it } from 'vitest'
import queryId from './queryId'

describe('queryId', () => {
  it('should generate consistent ids for the same query', () => {
    const query = { a: 1 }
    const options = { limit: 10 }
    expect(queryId(query, options)).toBe(queryId(query, options))
  })

  it('should generate different ids for different queries', () => {
    const query1 = { a: 1 }
    const query2 = { a: 2 }
    const options = { limit: 10 }
    expect(queryId(query1, options)).not.toBe(queryId(query2, options))
  })

  it('should generate different ids for different options', () => {
    const query = { a: 1 }
    const options1 = { limit: 10 }
    const options2 = { limit: 20 }
    expect(queryId(query, options1)).not.toBe(queryId(query, options2))
  })

  it('should handle undefined options', () => {
    const query = { a: 1 }
    expect(queryId(query)).toBe(queryId(query, undefined))
  })

  it('should handle complex selectors and options', () => {
    const query = { a: { $gt: 5 }, b: { $in: [1, 2, 3] } }
    const options = { sort: { a: -1 as const }, skip: 5 }
    expect(queryId(query, options)).toBe(queryId(query, options))
  })

  it('should generate same id for equivalent queries with different objects', () => {
    const query1 = { a: 1, b: { c: 2 } }
    const query2 = { a: 1, b: { c: 2 } }
    const options1 = { limit: 10, sort: { a: 1 as const } }
    const options2 = { limit: 10, sort: { a: 1 as const } }
    expect(queryId(query1, options1)).toBe(queryId(query2, options2))
  })

  it('should generate different ids for queries with different key orders', () => {
    const query1 = { a: 1, b: 2 }
    const query2 = { b: 2, a: 1 }
    const options = { limit: 10 }
    expect(queryId(query1, options)).not.toBe(queryId(query2, options))
  })

  it('should generate different ids for options with different key orders', () => {
    const query = { a: 1 }
    const options1 = { limit: 10, sort: { a: 1 as const } }
    const options2 = { sort: { a: 1 as const }, limit: 10 }
    expect(queryId(query, options1)).not.toBe(queryId(query, options2))
  })

  it('should handle complex types in selectors and options', () => {
    const query = { a: new Date() }
    expect(queryId(query)).toBe(queryId(query))
  })

  it('should handle complex types with different instances', () => {
    const query1 = { a: new Date('2023-01-01') }
    const query2 = { a: new Date('2023-01-01') }
    expect(queryId(query1)).toBe(queryId(query2))
  })

  it('should generate different ids for different complex types', () => {
    const query1 = { a: new Date('2023-01-01') }
    const query2 = { a: new Date('2024-01-01') }
    expect(queryId(query1)).not.toBe(queryId(query2))
  })
})
