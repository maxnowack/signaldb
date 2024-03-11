import { describe, it, expect } from 'vitest'
import serializeValue from './serializeValue'

describe('serializeValue', () => {
  it('should serialize a string value correctly', () => {
    expect(serializeValue('hello')).toBe('hello')
  })

  it('should serialize a number value correctly', () => {
    expect(serializeValue(42)).toBe('42')
  })

  it('should serialize a boolean value correctly', () => {
    expect(serializeValue(true)).toBe('true')
  })

  it('should serialize a Date value correctly', () => {
    expect(serializeValue(new Date('2022-01-01T00:00:00Z'))).toBe('2022-01-01T00:00:00.000Z')
  })

  it('should serialize an object value correctly', () => {
    expect(serializeValue({ name: 'John', age: 30 })).toBe('{"name":"John","age":30}')
  })
})
