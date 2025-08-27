import { it, expect, vi } from 'vitest'
import type { BaseItem, Changeset, Modifier } from '@signaldb/core'
import sync from '../src/sync'
import computeChanges from '../src/computeChanges'
import getSnapshot from '../src/getSnapshot'
import applyChanges from '../src/applyChanges'
import type { Change, LoadResponse } from '../src/types'

// Example item type
interface TestItem extends BaseItem<number> {
  id: number,
  name: string,
}

it('should apply changes to the last snapshot and push them to the server if there are changes', async () => {
  const lastSnapshot: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const data: LoadResponse<TestItem> = {
    items: [{ id: 1, name: 'Item 1' }],
  }
  const changes: Change<TestItem, number>[] = [{
    id: '1',
    collectionName: 'test',
    time: Date.now(),
    type: 'insert',
    data: { id: 2, name: 'Item 2' },
  }]

  const mockPull = vi.fn().mockImplementation(() => ({
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  }))
  const mockPush = vi.fn<(changes: Changeset<TestItem>) => Promise<void>>()
  const mockInsert = vi.fn<(item: TestItem) => Promise<void>>()
  const mockUpdate = vi.fn<(id: number, modifier: Modifier<TestItem>) => Promise<void>>()
  const mockRemove = vi.fn<(id: number) => Promise<void>>()
  const batch = vi.fn().mockImplementation((fn: () => void) => fn())

  const snapshot = getSnapshot(lastSnapshot, data)
  const newSnapshotWithChanges = applyChanges(snapshot, changes)
  const changesToPush = computeChanges(snapshot, newSnapshotWithChanges)

  await sync({
    changes,
    lastSnapshot,
    data,
    pull: mockPull,
    push: mockPush,
    insert: mockInsert,
    update: mockUpdate,
    remove: mockRemove,
    batch,
  })

  expect(batch).toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledWith(changesToPush)
  expect(mockPull).toHaveBeenCalled()
  expect(mockInsert).not.toHaveBeenCalled()
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(mockRemove).not.toHaveBeenCalled()
})

it('should not push changes if there is no difference between snapshots', async () => {
  const lastSnapshot: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const data: LoadResponse<TestItem> = {
    items: [{ id: 1, name: 'Item 1' }],
  }
  const changes: Change<TestItem, number>[] = []

  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>()
  const mockPush = vi.fn<(changes: Changeset<TestItem>) => Promise<void>>()
  const mockInsert = vi.fn<(item: TestItem) => Promise<void>>()
  const mockUpdate = vi.fn<(id: number, modifier: Modifier<TestItem>) => Promise<void>>()
  const mockRemove = vi.fn<(id: number) => Promise<void>>()
  const batch = vi.fn().mockImplementation((fn: () => void) => fn())

  const lastSnapshotWithChanges = applyChanges(lastSnapshot, changes)

  expect(lastSnapshotWithChanges).toEqual(lastSnapshot)

  await sync({
    changes,
    lastSnapshot,
    data,
    pull: mockPull,
    push: mockPush,
    insert: mockInsert,
    update: mockUpdate,
    remove: mockRemove,
    batch,
  })

  expect(batch).toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockPull).not.toHaveBeenCalled()
  expect(mockInsert).not.toHaveBeenCalled()
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(mockRemove).not.toHaveBeenCalled()
})

it('should apply new data changes if no local changes are provided', async () => {
  const lastSnapshot: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const data: LoadResponse<TestItem> = {
    items: [{ id: 1, name: 'Updated Item 1' }, { id: 2, name: 'Item 2' }],
  }
  const changes: Change<TestItem, number>[] = []

  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>()
  const mockPush = vi.fn<(changes: Changeset<TestItem>) => Promise<void>>()
  const mockInsert = vi.fn<(item: TestItem) => Promise<void>>()
  const mockUpdate = vi.fn<(id: number, modifier: Modifier<TestItem>) => Promise<void>>()
  const mockRemove = vi.fn<(id: number) => Promise<void>>()
  const batch = vi.fn().mockImplementation((fn: () => void) => fn())

  await sync({
    changes,
    lastSnapshot,
    data,
    pull: mockPull,
    push: mockPush,
    insert: mockInsert,
    update: mockUpdate,
    remove: mockRemove,
    batch,
  })

  expect(batch).toHaveBeenCalled()
  expect(mockInsert).toHaveBeenCalledWith({ id: 2, name: 'Item 2' })
  expect(mockUpdate).toHaveBeenCalledWith(1, { $set: { id: 1, name: 'Updated Item 1' } })
  expect(mockRemove).not.toHaveBeenCalled()
})

it('should pull new data after pushing changes to the server', async () => {
  const lastSnapshot: TestItem[] = [{ id: 1, name: 'Item 1' }]
  const data: LoadResponse<TestItem> = {
    items: [{ id: 1, name: 'Item 1' }],
  }
  const changes: Change<TestItem, number>[] = [{
    id: '1',
    collectionName: 'test',
    time: Date.now(),
    type: 'update',
    data: { id: 1, modifier: { $set: { name: 'Updated Item 1' } } },
  }]

  const mockPull = vi.fn<() => Promise<LoadResponse<TestItem>>>()
  const mockPush = vi.fn<(changes: Changeset<TestItem>) => Promise<void>>()
  const mockInsert = vi.fn<(item: TestItem) => Promise<void>>()
  const mockUpdate = vi.fn<(id: number, modifier: Modifier<TestItem>) => Promise<void>>()
  const mockRemove = vi.fn<(id: number) => Promise<void>>()
  const batch = vi.fn().mockImplementation((fn: () => void) => fn())

  const newServerData: LoadResponse<TestItem> = {
    items: [{ id: 1, name: 'Updated Item 1' }],
  }
  mockPull.mockResolvedValue(newServerData)

  await sync({
    changes,
    lastSnapshot,
    data,
    pull: mockPull,
    push: mockPush,
    insert: mockInsert,
    update: mockUpdate,
    remove: mockRemove,
    batch,
  })

  expect(batch).toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalled()
  expect(mockPull).toHaveBeenCalled()
  expect(mockInsert).not.toHaveBeenCalled()
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(mockRemove).not.toHaveBeenCalled()
})
