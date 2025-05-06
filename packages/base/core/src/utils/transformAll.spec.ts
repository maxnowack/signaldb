import { describe, it, expect } from 'vitest'
import transformAll from './transformAll'

describe('transformAll', () => {
  const parents = [{
    id: '1',
    name: 'John Doe Sr.',
  }]
  const objects = [{
    name: 'John Doe',
    age: 25,
    parent: '1',
  }]

  it('should transformAll with a parent', () => {
    const result = transformAll<any>(objects, {
      fields: {
        name: 1,
        age: 1,
        parent: 1,
      },
      transformAll: (items, fields) => {
        if (fields?.parent) {
          return items.map((item) => {
            item.parent = parents.find(parent => parent.id === item.parent)
          })
        }
      },
    })

    expect(result).toEqual([{
      name: 'John Doe',
      age: 25,
      parent: {
        id: '1',
        name: 'John Doe Sr.',
      },
    }])
  })

  it('should skip transformAll', () => {
    const result = transformAll<any>(objects, {})

    expect(result).toEqual([{
      name: 'John Doe',
      age: 25,
      parent: '1',
    }])
  })
})
