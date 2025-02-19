/* istanbul ignore file -- @preserve */
import { bench, describe } from 'vitest'
import applyChanges from '../src/applyChanges'
import type { Change } from '../src/types'

interface TestItem {
  id: string,
  value: number,
}

describe('applyChanges benchmarks', () => {
  // Setup test data
  const items: TestItem[] = Array.from({ length: 1000 }, (_, i) => ({
    id: `id${i}`,
    value: i,
  }))

  bench('apply 100 insert changes', () => {
    const changes: Change<TestItem, string>[] = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      collectionName: 'test',
      time: Date.now(),
      type: 'insert',
      data: { id: `newId${i}`, value: i + 1000 },
    }))
    applyChanges(items, changes)
  })

  bench('apply 100 remove changes', () => {
    const changes: Change<TestItem, string>[] = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      collectionName: 'test',
      time: Date.now(),
      type: 'remove',
      data: `id${i}`,
    }))
    applyChanges(items, changes)
  })

  bench('apply 100 update changes', () => {
    const changes: Change<TestItem, string>[] = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      collectionName: 'test',
      time: Date.now(),
      type: 'update',
      data: {
        id: `id${i}`,
        modifier: {
          $set: {
            value: i + 1,
          },
        },
      },
    }))
    applyChanges(items, changes)
  })

  bench('apply mixed changes (insert, remove, update)', () => {
    const changes: Change<TestItem, string>[] = [
      ...Array.from({ length: 33 }, (_, i) => ({
        id: `${i}`,
        collectionName: 'test',
        time: Date.now(),
        type: 'insert' as const,
        data: { id: `newId${i}`, value: i + 1000 },
      })),
      ...Array.from({ length: 33 }, (_, i) => ({
        id: `${i}`,
        collectionName: 'test',
        time: Date.now(),
        type: 'remove' as const,
        data: `id${i}`,
      })),
      ...Array.from({ length: 34 }, (_, i) => ({
        id: `${i}`,
        collectionName: 'test',
        time: Date.now(),
        type: 'update' as const,
        data: {
          id: `id${i + 33}`,
          modifier: {
            $set: {
              value: i + 1,
            },
          },
        },
      })),
    ]
    applyChanges(items, changes)
  })
})
