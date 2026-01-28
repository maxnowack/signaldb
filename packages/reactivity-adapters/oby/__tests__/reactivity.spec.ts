import { vi, describe, it, expect } from 'vitest'
import { effect, tick } from 'oby'
import { Collection } from '@signaldb/core'
import obyReactivityAdapter from '../src'

describe('@signaldb/oby', () => {
  it('should be reactive with oby', async () => {
    const reactivity = obyReactivityAdapter
    const originalOnDispose = reactivity.onDispose
    const dispose = vi.fn()
    reactivity.onDispose = (callback, dependency) => {
      if (!originalOnDispose) return
      dispose.mockImplementation(callback)
      originalOnDispose(dispose, dependency)
    }

    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    effect(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    tick()
    await collection.insert({ id: '1', name: 'John' })
    tick()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
