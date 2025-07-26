import { vi, describe, it, expect } from 'vitest'
import {
  tick,
  effect,
} from '@maverick-js/signals'
import { Collection } from '@signaldb/core'
import maverickjsReactivityAdapter from '../src'

describe('@signaldb/maverickjs', () => {
  it('should be reactive with @maverick-js/signals', async () => {
    const reactivity = maverickjsReactivityAdapter
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
