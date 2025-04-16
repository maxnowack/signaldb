import { describe, it, expect } from 'vitest'
import enrich from './enrich'

describe('enrich', () => {
  const parents = [{
    id: '1',
    name: 'John Doe Sr.',
  }]
  const objects = [{
    name: 'John Doe',
    age: 25,
    parent: '1',
  }]

  it('should enrich with a parent', () => {
    const result = enrich(objects, {
      fields: {
        name: 1,
        age: 1,
        parent: 1,
      },
      enrichCollection: (items, fields) => {
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
})
