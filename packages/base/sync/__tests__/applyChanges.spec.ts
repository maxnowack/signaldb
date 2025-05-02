import { it, expect } from 'vitest'
import type { BaseItem } from '@signaldb/core'
import type { Change } from '../src/types'
import applyChanges from '../src/applyChanges'

// Example BaseItem Type
interface TestItem extends BaseItem<number> {
  id: number,
  name: string,
}

/**
 * Returns a default change item with the given id.
 * @param id - The id of the change item.
 * @returns The default change item.
 */
function getDefaultChangeItem(id = '1') {
  return { id, time: Date.now(), collectionName: 'test' }
}

it('should insert new items', async () => {
  const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem(), type: 'insert', data: { id: 2, name: 'Item 2' } },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ])
})

it('should update an item', async () => {
  const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem(), type: 'update', data: { id: 1, modifier: { $set: { name: 'Updated Item 1' } } } },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([{ id: 1, name: 'Updated Item 1' }])
})

it('should remove an item', async () => {
  const items: TestItem[] = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }]
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem(), type: 'remove', data: 1 },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([{ id: 2, name: 'Item 2' }])
})

it('should handle a mix of inserts, updates, and removes', async () => {
  const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem('1'), type: 'insert', data: { id: 2, name: 'Item 2' } },
    { ...getDefaultChangeItem('2'), type: 'update', data: { id: 1, modifier: { $set: { name: 'Updated Item 1' } } } },
    { ...getDefaultChangeItem('3'), type: 'remove', data: 2 },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([{ id: 1, name: 'Updated Item 1' }])
})

it('should update already existing items with insert', async () => {
  const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem(), type: 'insert', data: { id: 1, name: 'New Item Name' } },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([
    { id: 1, name: 'New Item Name' },
  ])
})

it('should insert non-existing items on update', async () => {
  const items: TestItem[] = []
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem(), type: 'update', data: { id: 1, modifier: { $set: { name: 'Updated Item 1' } } } },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([{ id: 1, name: 'Updated Item 1' }])
})

it('should not modify the original items array', async () => {
  const items: TestItem[] = [{ id: 1, name: 'Item 1', meta: { likes: 5 } }]
  const changes: Change<TestItem, number>[] = [
    { ...getDefaultChangeItem(), type: 'insert', data: { id: 2, name: 'Item 2' } },
    { ...getDefaultChangeItem(), type: 'update', data: { id: 1, modifier: { $set: { 'meta.likes': 14 } } } },
  ]

  const result = applyChanges(items, changes)
  expect(result).toEqual([
    { id: 1, name: 'Item 1', meta: { likes: 14 } },
    { id: 2, name: 'Item 2' },
  ])
  expect(items).toEqual([{ id: 1, name: 'Item 1', meta: { likes: 5 } }])
})
