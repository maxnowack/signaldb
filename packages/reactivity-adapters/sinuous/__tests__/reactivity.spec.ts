import { vi, describe, it, expect } from 'vitest'
import { api } from 'sinuous'
import { Collection } from '@signaldb/core'
import sinuousReactivityAdapter from '../src'

describe('@signaldb/sinuous', () => {
  it('should be reactive with sinuous', async () => {
    const reactivity = sinuousReactivityAdapter
    const originalOnDispose = reactivity.onDispose
    const dispose = vi.fn()
    reactivity.onDispose = (callback, dependency) => {
      if (!originalOnDispose) return
      dispose.mockImplementation(callback)
      originalOnDispose(dispose, dependency)
    }
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    api.subscribe(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    await collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
