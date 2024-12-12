import type { Tracker } from 'meteor-ts-tracker'
import { createReactivityAdapter } from '@signaldb/core'

/**
 * Creates a reactivity adapter for Meteor's Tracker, integrating SignalDB with
 * Meteor's reactive programming model.
 * @param tracker - The Meteor Tracker instance to use for dependency tracking and notifications.
 * @returns A reactivity adapter compatible with SignalDB, providing methods for
 *   dependency tracking, notifications, and scope management.
 * @example
 * import { Tracker } from 'meteor/tracker';
 * import createMeteorReactivityAdapter from '@signaldb/meteor';
 *
 * const reactivityAdapter = createMeteorReactivityAdapter(Tracker);
 *
 * // Use the adapter in a SignalDB collection
 * import { Collection } from '@signaldb/core';
 *
 * const myCollection = new Collection({
 *   reactivity: reactivityAdapter,
 * });
 *
 * Tracker.autorun(() => {
 *   const items = myCollection.find().fetch();
 *   console.log('Reactive items:', items);
 * });
 */
export default function createMeteorReactivityAdapter(tracker: typeof Tracker) {
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
