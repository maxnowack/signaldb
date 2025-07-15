import { vi, describe, it, expect } from 'vitest'
import { autorun } from 'mobx'
import { Collection } from '@signaldb/core'
import mobxReactivityAdapter from '../src'

describe('@signaldb/mobx', () => {
  it('should be reactive with MobX', async () => {
    const reactivity = mobxReactivityAdapter
    const originalOnDispose = reactivity.onDispose
    const dispose = vi.fn()
    reactivity.onDispose = (callback, dependency) => {
      if (!originalOnDispose) return
      dispose.mockImplementation(callback)
      originalOnDispose(dispose, dependency)
    }

    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const stop = autorun(() => {
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
    stop()
  })
})
