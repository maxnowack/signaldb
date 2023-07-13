import { jest, describe, it, expect } from '@jest/globals'
import { Tracker } from 'meteor-ts-tracker'
import type { ReactivityInterface } from 'index'
import { Collection } from 'index'

const trackerReactivity: ReactivityInterface = {
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
  onDispose: (callback) => {
    Tracker.onInvalidate(callback)
  },
}

describe('Reactivity', () => {
  it('should be reactive', () => {
    const collection = new Collection({
      reactivity: trackerReactivity,
    })
    const callback = jest.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    Tracker.flush()
    collection.insert({ id: '1', name: 'John' })
    Tracker.flush()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })

  it('should allow overriding reactivity primitives for query', () => {
    const collection = new Collection()
    const callback = jest.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }, {
        reactive: trackerReactivity,
      }).count())
    })
    Tracker.flush()
    collection.insert({ id: '1', name: 'John' })
    Tracker.flush()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
