import { describe, it, expect } from 'vitest'
import isFieldExpression from './isFieldExpression'

describe('isFieldExpression', () => {
  it('should return true for a valid FieldExpression', () => {
    const expression = { $eq: 'foo' }
    expect(isFieldExpression(expression)).toBe(true)
  })

  it('should return false for a non-object', () => {
    const expression = 'foo'
    expect(isFieldExpression(expression)).toBe(false)
  })

  it('should return false for a null value', () => {
    const expression = null
    expect(isFieldExpression(expression)).toBe(false)
  })

  it('should return false for an empty object', () => {
    const expression = {}
    expect(isFieldExpression(expression)).toBe(false)
  })

  it('should return false for an object with an invalid key', () => {
    const expression = { $eq: 'foo', $invalid: 'bar' }
    expect(isFieldExpression(expression)).toBe(false)
  })
})
