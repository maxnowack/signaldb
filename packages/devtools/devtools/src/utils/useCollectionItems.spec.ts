/* @vitest-environment happy-dom */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import useCollectionItems from './useCollectionItems'

// Node 22+ defines its own global `localStorage`, which is unusable without
// `--localstorage-file` and shadows the one happy-dom provides.
vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})

describe('useCollectionItems', () => {
  afterEach(() => {
    cleanup()
  })

  it('returns an empty list for an unknown collection', () => {
    const { result } = renderHook(() => useCollectionItems('unknown'))
    expect(result.current).toEqual([])
  })

  it('returns the items of a collection and follows its writes', async () => {
    const collection = new Collection<{ id: string, name: string }>(
      'items-hook',
      new DefaultDataAdapter(),
    )
    await collection.insert({ id: '1', name: 'one' })

    const { result } = renderHook(() => useCollectionItems('items-hook'))
    await waitFor(() => expect(result.current).toEqual([{ id: '1', name: 'one' }]))

    await collection.insert({ id: '2', name: 'two' })
    await waitFor(() => expect(result.current).toHaveLength(2))

    await collection.updateOne({ id: '1' }, { $set: { name: 'uno' } })
    await waitFor(() => expect(result.current).toContainEqual({ id: '1', name: 'uno' }))

    await collection.removeOne({ id: '2' })
    await waitFor(() => expect(result.current).toEqual([{ id: '1', name: 'uno' }]))

    await collection.dispose()
  })
})
