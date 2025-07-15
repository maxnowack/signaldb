import { vi, describe, it, expect } from 'vitest'
import { effect } from 'usignal'
import { Collection } from '@signaldb/core'
import usignalReactivityAdapter from '../src'

describe('@signaldb/usignal', () => {
  it('should be reactive with usignal', async () => {
    const collection = new Collection({ reactivity: usignalReactivityAdapter })
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
