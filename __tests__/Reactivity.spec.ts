import { jest, describe, it, expect } from '@jest/globals'
import { Tracker } from 'meteor-ts-tracker'
import { signal, tick, peek, effect, onDispose } from '@maverick-js/signals'
import type { ReactivityInterface } from 'index'
import { Collection } from 'index'

describe('Reactivity', () => {
  describe('Tracker', () => {
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

    it('should be reactive with Tracker', () => {
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

  describe('@maverick-js/signals', () => {
    const signalReactivity: ReactivityInterface = {
      create: () => {
        const dep = signal(0)
        return {
          depend: () => {
            dep()
          },
          notify: () => {
            dep.set(peek(() => dep() + 1))
          },
        }
      },
      onDispose: (callback) => {
        onDispose(callback)
      },
    }

    it('should be reactive with @maverick-js/signals', () => {
      const collection = new Collection({
        reactivity: signalReactivity,
      })
      const callback = jest.fn()

      effect(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      tick()
      collection.insert({ id: '1', name: 'John' })
      tick()
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })
})
