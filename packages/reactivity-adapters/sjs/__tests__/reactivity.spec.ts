import { vi, describe, it, expect } from 'vitest'
import S from 's-js'
import { Collection } from '@signaldb/core'
import sReactivityAdapter from '../src'

describe('@signaldb/sjs', () => {
  it('should be reactive with S.js', async () => {
    const reactivity = sReactivityAdapter
    const originalOnDispose = reactivity.onDispose
    const dispose = vi.fn()
    reactivity.onDispose = (callback, dependency) => {
      if (!originalOnDispose) return
      dispose.mockImplementation(callback)
      originalOnDispose(dispose, dependency)
    }
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    S(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
