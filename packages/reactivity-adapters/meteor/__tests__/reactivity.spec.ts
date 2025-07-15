import { vi, describe, it, expect } from 'vitest'
import { Tracker } from 'meteor-ts-tracker'
import { Collection } from '@signaldb/core'
import createMeteorReactivityAdapter from '../src'

describe('@signaldb/meteor', () => {
  const reactivity = createMeteorReactivityAdapter(Tracker)
  const originalOnDispose = reactivity.onDispose
  const dispose = vi.fn()
  reactivity.onDispose = (callback, dependency) => {
    if (!originalOnDispose) return
    dispose.mockImplementation(callback)
    originalOnDispose(dispose, dependency)
  }

  it('should be reactive with Tracker', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    Tracker.flush()
    await collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    Tracker.flush()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })

  it('should allow overriding reactivity primitives for query', async () => {
    const collection = new Collection()
    const callback = vi.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }, {
        reactive: reactivity,
      }).count())
    })
    Tracker.flush()
    await collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    Tracker.flush()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
