import { it, expect } from 'vitest'
import computeChanges from '../../src/SyncManager/computeChanges'

interface TestItem {
  id: number,
  name: string,
  value: number,
}

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
    removed: [],
  })
})
