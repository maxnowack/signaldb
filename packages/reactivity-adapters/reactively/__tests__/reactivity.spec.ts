import { vi, describe, it, expect } from 'vitest'
import { reactive } from '@reactively/core'
import { Collection } from '@signaldb/core'
import reactivelyReactivityAdapter from '../src'

describe('@signaldb/reactively', () => {
  it('should be reactive with reactively', async () => {
    const reactivity = reactivelyReactivityAdapter
    const originalOnDispose = reactivity.onDispose
    const dispose = vi.fn()
    reactivity.onDispose = (callback, dependency) => {
      if (!originalOnDispose) return
      dispose.mockImplementation(callback)
      originalOnDispose(dispose, dependency)
    }
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const exec = reactive(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    exec.get()
    await collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    exec.get()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
