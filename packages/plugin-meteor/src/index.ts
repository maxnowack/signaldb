import type { Tracker } from 'meteor-ts-tracker'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for Meteor. See https://signaldb.js.org/reactivity/meteor/ for more information.
 */
export function createMeteorReactivityAdapter(tracker: typeof Tracker) {
  return createReactivityAdapter({
    create: () => {
      const dep = new tracker.Dependency()
      return {
        depend: () => {
          if (!tracker.active) return
          dep.depend()
        },
        notify: () => dep.changed(),
      }
    },
    isInScope: () => tracker.active,
    onDispose: (callback) => {
      if (!tracker.active) return
      tracker.onInvalidate(callback)
    },
  })
}

export default createMeteorReactivityAdapter
