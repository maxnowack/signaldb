import { vi, describe, it, expect } from 'vitest'
import { effect } from '@preact/signals-core'
import { Collection } from '@signaldb/core'
import preactReactivityAdapter from '../src'

describe('@signaldb/preact', () => {
  it('should be reactive with preact', async () => {
    const collection = new Collection({ reactivity: preactReactivityAdapter })
    const callback = vi.fn()
    const cleanup = vi.fn()

    effect(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
      cleanup.mockImplementation(() => cursor.cleanup())
      return () => cleanup()
    })
    await collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
