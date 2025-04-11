import { it, expect, describe } from 'vitest'
import computeChanges, { computeModifiedFields } from '../src/computeChanges'

interface TestItem {
  id: number,
  name: string,
  value: number,
}

describe('computeChanges', () => {
  it('should detect added items', () => {
    const oldItems: TestItem[] = [{ id: 1, name: 'Item 1', value: 10 }]
    const newItems: TestItem[] = [
      { id: 1, name: 'Item 1', value: 10 },
      { id: 2, name: 'Item 2', value: 20 },
    ]

    const result = computeChanges(oldItems, newItems)
    expect(result).toEqual({
      added: [{ id: 2, name: 'Item 2', value: 20 }],
      modified: [],
      modifiedFields: new Map(),
      removed: [],
    })
  })

  it('should detect removed items', () => {
    const oldItems: TestItem[] = [
      { id: 1, name: 'Item 1', value: 10 },
      { id: 2, name: 'Item 2', value: 20 },
    ]
    const newItems: TestItem[] = [{ id: 1, name: 'Item 1', value: 10 }]

    const result = computeChanges(oldItems, newItems)
    expect(result).toEqual({
      added: [],
      modified: [],
      modifiedFields: new Map(),
      removed: [{ id: 2, name: 'Item 2', value: 20 }],
    })
  })

  it('should detect modified items', () => {
    const oldItems: TestItem[] = [{ id: 1, name: 'Item 1', value: 10 }]
    const newItems: TestItem[] = [{ id: 1, name: 'Item 1', value: 15 }]

    const result = computeChanges(oldItems, newItems)
    expect(result).toEqual({
      added: [],
      modified: [{ id: 1, name: 'Item 1', value: 15 }],
      modifiedFields: new Map([
        [1, ['value']],
      ]),
      removed: [],
    })
  })

  it('should detect a mix of added, modified, and removed items', () => {
    const oldItems: TestItem[] = [
      { id: 1, name: 'Item 1', value: 10 },
      { id: 2, name: 'Item 2', value: 20 },
    ]
    const newItems: TestItem[] = [
      { id: 1, name: 'Item 1', value: 15 },
      { id: 3, name: 'Item 3', value: 30 },
    ]

    const result = computeChanges(oldItems, newItems)
    expect(result).toEqual({
      added: [{ id: 3, name: 'Item 3', value: 30 }],
      modified: [{ id: 1, name: 'Item 1', value: 15 }],
      modifiedFields: new Map([
        [1, ['value']],
      ]),
      removed: [{ id: 2, name: 'Item 2', value: 20 }],
    })
  })

  it('should not detect any changes if items are the same', () => {
    const oldItems: TestItem[] = [{ id: 1, name: 'Item 1', value: 10 }]
    const newItems: TestItem[] = [{ id: 1, name: 'Item 1', value: 10 }]

    const result = computeChanges(oldItems, newItems)
    expect(result).toEqual({
      added: [],
      modified: [],
      modifiedFields: new Map(),
      removed: [],
    })
  })

  it('should include modified fields information', () => {
    const oldItems = [
      { id: 1, name: 'Item 1', value: 10 },
      { id: 2, name: 'Item 2', value: 20 },
    ]
    const newItems = [
      { id: 1, name: 'Item 1 Updated', value: 10 },
      { id: 2, name: 'Item 2', value: 20 },
    ]

    const result = computeChanges(oldItems, newItems)
    expect(result.modified).toEqual([{ id: 1, name: 'Item 1 Updated', value: 10 }])
  })

  it('should handle arrays in items', () => {
    const oldItems = [{ id: 1, tags: ['tag1', 'tag2'] }]
    const newItems = [{ id: 1, tags: ['tag1', 'tag3'] }]

    const result = computeChanges(oldItems, newItems)
    expect(result.modified).toEqual([{ id: 1, tags: ['tag1', 'tag3'] }])
  })

  it('should handle empty arrays', () => {
    const oldItems: any[] = []
    const newItems = [{ id: 1, name: 'Item 1' }]

    const result = computeChanges(oldItems, newItems)
    expect(result.added).toEqual([{ id: 1, name: 'Item 1' }])
    expect(result.modified).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('should handle items with complex nested structures', () => {
    const oldItems = [{
      id: 1,
      config: {
        settings: {
          display: { color: 'red', size: 'medium' },
          features: ['a', 'b'],
        },
      },
    }]
    const newItems = [{
      id: 1,
      config: {
        settings: {
          display: { color: 'blue', size: 'medium' },
          features: ['a', 'b'],
        },
      },
    }]

    const result = computeChanges(oldItems, newItems)
    expect(result.modified).toEqual([{
      id: 1,
      config: {
        settings: {
          display: { color: 'blue', size: 'medium' },
          features: ['a', 'b'],
        },
      },
    }])
  })
})

describe('computeModifiedFields', () => {
  it('should detect modified primitive fields', () => {
    const oldItem = { id: 1, name: 'Item 1', value: 10 }
    const newItem = { id: 1, name: 'Item 1 Updated', value: 10 }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['name'])
  })

  it('should detect multiple modified primitive fields', () => {
    const oldItem = { id: 1, name: 'Item 1', value: 10 }
    const newItem = { id: 1, name: 'Item 1 Updated', value: 20 }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toContain('name')
    expect(result).toContain('value')
    expect(result.length).toBe(2)
  })

  it('should detect nested modified fields', () => {
    const oldItem = {
      id: 1,
      metadata: {
        created: '2023-01-01',
        author: 'John',
      },
    }
    const newItem = {
      id: 1,
      metadata: {
        created: '2023-01-01',
        author: 'Jane',
      },
    }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['metadata.author'])
  })

  it('should detect deeply nested modified fields', () => {
    const oldItem = {
      id: 1,
      metadata: {
        author: {
          firstName: 'John',
          lastName: 'Doe',
        },
      },
    }
    const newItem = {
      id: 1,
      metadata: {
        author: {
          firstName: 'John',
          lastName: 'Smith',
        },
      },
    }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['metadata.author.lastName'])
  })

  it('should return an empty array if no fields are modified', () => {
    const oldItem = { id: 1, name: 'Item 1', value: 10 }
    const newItem = { id: 1, name: 'Item 1', value: 10 }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual([])
  })

  it('should detect changes in arrays', () => {
    const oldItem = { id: 1, tags: ['tag1', 'tag2'] }
    const newItem = { id: 1, tags: ['tag1', 'tag3'] }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['tags.1'])
  })

  it('should detect changes in nested arrays', () => {
    const oldItem = { id: 1, categories: { primary: ['cat1', 'cat2'] } }
    const newItem = { id: 1, categories: { primary: ['cat1', 'cat3'] } }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['categories.primary.1'])
  })

  it('should detect changes in arrays of objects', () => {
    const oldItem = {
      id: 1,
      subItems: [
        { id: 1, name: 'Sub 1' },
        { id: 2, name: 'Sub 2' },
      ],
    }
    const newItem = {
      id: 1,
      subItems: [
        { id: 1, name: 'Sub 1' },
        { id: 2, name: 'Sub 2 Updated' },
      ],
    }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['subItems.1.name'])
  })

  it('should handle null and undefined values', () => {
    const oldItem = { id: 1, name: 'Item 1', value: null, optional: undefined }
    const newItem = { id: 1, name: 'Item 1', value: 10, optional: 'now defined' }

    const result = computeModifiedFields<Record<string, any>>(oldItem, newItem)
    expect(result).toContain('value')
    expect(result).toContain('optional')
    expect(result.length).toBe(2)
  })

  it('should detect when a field is added', () => {
    const oldItem = { id: 1, name: 'Item 1' }
    const newItem = { id: 1, name: 'Item 1', value: 10 }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['value'])
  })

  it('should detect when a field is removed', () => {
    const oldItem = { id: 1, name: 'Item 1', value: 10 }
    const newItem = { id: 1, name: 'Item 1' }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toEqual(['value'])
  })

  it('should detect multiple modified fields in a complex object', () => {
    const oldItem = {
      id: 1,
      name: 'Item 1',
      details: {
        description: 'A test item',
        tags: ['tag1', 'tag2'],
      },
    }
    const newItem = {
      id: 1,
      name: 'Item 1 Updated',
      details: {
        description: 'A test item with updates',
        tags: ['tag1', 'tag3'],
      },
    }

    const result = computeModifiedFields(oldItem, newItem)
    expect(result).toContain('name')
    expect(result).toContain('details.description')
    expect(result).toContain('details.tags.1')
    expect(result.length).toBe(3)
  })
})
