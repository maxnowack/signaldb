import { vi, describe, it, expect } from 'vitest'
import { Tracker } from 'meteor-ts-tracker'
import { Collection, createReactivityAdapter } from 'signaldb'

describe('Tracker', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = new Tracker.Dependency()
      return {
        depend: () => {
          if (!Tracker.active) return
          dep.depend()
        },
        notify: () => dep.changed(),
      }
    },
    isInScope: () => Tracker.active,
    onDispose: vi.fn((callback) => {
      if (!Tracker.active) return
      Tracker.onInvalidate(callback)
    }),
  })

  it('should be reactive with Tracker', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    Tracker.flush()
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    Tracker.flush()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
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
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    Tracker.flush()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
