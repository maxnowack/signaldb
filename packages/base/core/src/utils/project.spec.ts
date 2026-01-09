import { describe, it, expect } from 'vitest'
import project from './project'

describe('project', () => {
  const object = {
    name: 'John Doe',
    age: 25,
    address: {
      street: '123 Main St',
      city: 'New York',
    },
    hobbies: ['reading', 'gaming'],
  }

  it('should limit fields of the object', () => {
    const result = project(object, {
      'name': 1,
      'age': 0,
      'address.city': 1,
      'address.zipCode': 0,
      'hobbies': 1,
    })

    expect(result).toEqual({
      name: 'John Doe',
      address: {
        city: 'New York',
      },
      hobbies: ['reading', 'gaming'],
    })
  })

  it('should limit fields by disabling fields', () => {
    const result = project(object, {
      age: 0,
      address: 0,
    })

    expect(result).toEqual({
      name: 'John Doe',
      hobbies: ['reading', 'gaming'],
    })
  })

  it('should remove nulls if deactivated', () => {
    const result = project({ foo: null }, { foo: 0 })
    expect(result).toEqual({})
  })

  it('should handle nested fields that do not exist in the object', () => {
    const result = project(object, {
      'address.zipCode': 1,
    })

    expect(result).toEqual({})
  })

  it('should handle an empty object', () => {
    const result = project({}, {
      name: 1,
    })

    expect(result).toEqual({})
  })

  it('should preserve null values when explicitly included', () => {
    const result = project({ foo: null, bar: 1 }, { foo: 1 })
    expect(result).toEqual({ foo: null })
  })

  it('should remove nested keys when every field is excluded', () => {
    const sample = { profile: { address: { city: 'NYC', zip: '00000' } }, keep: true }
    const result = project(sample, { 'profile.address.city': 0 })
    expect(result).toEqual({ profile: { address: { zip: '00000' } }, keep: true })
  })
})
