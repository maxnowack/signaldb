import { it, expect } from 'vitest'
import type { BaseItem } from '@signaldb/core'
import getSnapshot from '../src/getSnapshot'
import type { LoadResponse } from '../src/types'

interface TestItem extends BaseItem<number> {
  id: number,
  name: string,
}

it('should return data.items when it is not null', () => {
  const lastSnapshot: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ]
  const data: LoadResponse<TestItem> = {
    items: [{ id: 3, name: 'Item 3' }],
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([{ id: 3, name: 'Item 3' }])
})

it('should apply added changes when data.items is null', () => {
  const lastSnapshot: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ]
  const data: LoadResponse<TestItem> = {
    changes: { added: [{ id: 3, name: 'Item 3' }], modified: [], removed: [] },
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
    { id: 3, name: 'Item 3' },
  ])
})

it('should apply modified changes when data.items is null', () => {
  const lastSnapshot: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ]
  const data: LoadResponse<TestItem> = {
    changes: { added: [], modified: [{ id: 2, name: 'Updated Item 2' }], removed: [] },
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Updated Item 2' },
  ])
})

it('should apply removed changes when data.items is null', () => {
  const lastSnapshot: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ]
  const data: LoadResponse<TestItem> = {
    changes: { added: [], modified: [], removed: [{ id: 1, name: 'Item 1' }] },
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([{ id: 2, name: 'Item 2' }])
})

it('should handle a combination of added, modified, and removed changes', () => {
  const lastSnapshot: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ]
  const data: LoadResponse<TestItem> = {
    changes: {
      added: [{ id: 3, name: 'Item 3' }],
      modified: [{ id: 2, name: 'Updated Item 2' }],
      removed: [{ id: 1, name: 'Item 1' }],
    },
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([
    { id: 2, name: 'Updated Item 2' },
    { id: 3, name: 'Item 3' },
  ])
})

it('should handle undefined lastSnapshot and apply changes', () => {
  const lastSnapshot: TestItem[] | undefined = undefined
  const data: LoadResponse<TestItem> = {
    changes: {
      added: [{ id: 3, name: 'Item 3' }],
      modified: [],
      removed: [],
    },
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([{ id: 3, name: 'Item 3' }])
})

it('should upsert changes', () => {
  const lastSnapshot: TestItem[] = [{ id: 2, name: 'Item 2' }]
  const data: LoadResponse<TestItem> = {
    changes: {
      added: [{ id: 2, name: 'Item 23' }],
      modified: [{ id: 3, name: 'Item 3' }],
      removed: [],
    },
  }

  const result = getSnapshot(lastSnapshot, data)
  expect(result).toEqual([{ id: 2, name: 'Item 23' }, { id: 3, name: 'Item 3' }])
})
