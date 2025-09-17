import type ReactivityAdapter from '../types/ReactivityAdapter'
import type { BaseItem, FindOptions, Transform } from './types'
import type { ObserveCallbacks } from './Observer'
import Observer from './Observer'

/**
 * Checks if the current scope is reactive, considering the provided reactivity adapter.
 * @param reactivity - The reactivity adapter or a boolean indicating whether reactivity is enabled.
 * @returns A boolean indicating if the current scope is reactive.
 */
export function isInReactiveScope(reactivity: ReactivityAdapter | undefined | false) {
  if (!reactivity) return false // if reactivity is disabled we don't need to check
  if (!reactivity.isInScope) return true // if reactivity is enabled and no isInScope method is provided we assume it is in scope
  return reactivity.isInScope() // if reactivity is enabled and isInScope method is provided we check if it is in scope
}

export interface CursorOptions<
  T extends BaseItem,
  U = T,
  Async extends boolean = false,
> extends FindOptions<T, Async> {
  transform?: Transform<T, U>,
  bindEvents?: (requery: () => void) => () => void,
}

/**
 * Represents a cursor for querying and observing a filtered, sorted, and transformed
 * subset of items from a collection. Supports reactivity and field tracking.
 * @template T - The type of the items in the collection.
 * @template U - The transformed item type after applying transformations (default is T).
 */
export default class Cursor<T extends BaseItem, U = T, Async extends boolean = false> {
  private observer: Observer<T> | undefined
  private getItems: Async extends true ? () => Promise<T[]> : () => T[]
  private options: CursorOptions<T, U, Async>
  private onCleanupCallbacks: (() => void)[] = []

  /**
   * Creates a new instance of the `Cursor` class.
   * Provides utilities for querying, observing, and transforming items from a collection.
   * @template T - The type of the items in the collection.
   * @template U - The transformed item type after applying transformations (default is T).
   * @param getItems - A function that retrieves the filtered list of items.
   * @param options - Optional configuration for the cursor.
   * @param options.transform - A transformation function to apply to each item when retrieving them.
   * @param options.bindEvents - A function to bind reactivity events for the cursor, which should return a cleanup function.
   * @param options.fields - A projection object defining which fields of the item should be included or excluded.
   * @param options.sort - A sort specifier to determine the order of the items.
   * @param options.skip - The number of items to skip from the beginning of the result set.
   * @param options.limit - The maximum number of items to return in the result set.
   * @param options.reactive - A reactivity adapter to enable observing changes in the cursor's result set.
   * @param options.fieldTracking - A boolean to enable fine-grained field tracking for reactivity.
   */
  constructor(
    getItems: Async extends true ? () => Promise<T[]> : () => T[],
    options?: CursorOptions<T, U, Async>,
  ) {
    this.getItems = getItems
    this.options = options || {}
  }

  private addGetters(item: T) {
    if (!isInReactiveScope(this.options.reactive)) return item
    const depend = this.depend.bind(this)
    return Object.entries(item).reduce((memo, [key, value]) => {
      Object.defineProperty(memo, key, {
        get() {
          depend({
            changedField: notify => (changedItem, changedFieldName) => {
              if (changedFieldName !== key || changedItem.id !== item.id) return
              notify()
            },
          })
          return value
        },
        enumerable: true,
        configurable: true,
      })
      return memo
    }, {}) as T
  }

  private transform(rawItem: T): U {
    const item = this.options.fieldTracking
      ? this.addGetters(rawItem)
      : rawItem
    if (!this.options.transform) return item as unknown as U
    return this.options.transform(item)
  }

  private depend(
    changeEvents: {
      [P in keyof ObserveCallbacks<T>]?: true
        | ((notify: () => void) => NonNullable<ObserveCallbacks<T>[P]>)
    },
  ) {
    if (this.options?.async) return
    if (!isInReactiveScope(this.options.reactive)) {
      // eslint-disable-next-line no-console
      console.warn('Cursor.depend() called outside of a reactive scope without async option; consider using { async: true } or wrapping in a reactive scope')
    }
    if (!this.options.reactive) return
    const signal = this.options.reactive.create()
    signal.depend()
    const notify = () => signal.notify()

    /**
     * Builds a notifier function for the specified event.
     * @template Event - The type of the event.
     * @param event - The event for which to build the notifier.
     * @returns A function that handles the event and triggers the appropriate notifications.
     */
    function buildNotifier<Event extends keyof ObserveCallbacks<T>>(
      event: Event,
    ) {
      const eventHandler = changeEvents[event]

      return (...args: Parameters<NonNullable<ObserveCallbacks<T>[Event]>>) => {
        // if the event is just turned on with true, we can notify directly
        if (eventHandler === true) {
          notify()
          return
        }

        // if the event is something else than true or a function, we don't care about it
        if (typeof eventHandler !== 'function') return

        // if the event is a function, we call it with the notify function
        eventHandler(notify)(...args as [T, T & keyof T, T[keyof T], T[keyof T]])
      }
    }

    const stop = this.observeRawChanges({
      added: buildNotifier('added'),
      addedBefore: buildNotifier('addedBefore'),
      changed: buildNotifier('changed'),
      changedField: buildNotifier('changedField'),
      movedBefore: buildNotifier('movedBefore'),
      removed: buildNotifier('removed'),
    }, true)
    if (this.options.reactive.onDispose) {
      this.options.reactive.onDispose(() => stop(), signal)
    }
    this.onCleanup(stop)
  }

  private ensureObserver() {
    if (!this.observer) {
      const observer = new Observer<T>(() => {
        const requery = () => {
          observer.runChecks(this.getItems)
        }
        const cleanup = this.options.bindEvents && this.options.bindEvents(requery)
        return () => {
          if (cleanup) cleanup()
        }
      })
      this.onCleanup(() => observer.stop())
      this.observer = observer
    }
    return this.observer
  }

  private observeRawChanges(callbacks: ObserveCallbacks<T>, skipInitial = false) {
    const observer = this.ensureObserver()
    observer.addCallbacks(callbacks, skipInitial)
    observer.runChecks(this.getItems)
    return () => {
      observer.removeCallbacks(callbacks)
      if (!observer.isEmpty()) return

      // remove observer if it's empty
      observer.stop()
      this.observer = undefined
    }
  }

  /**
   * Cleans up all resources associated with the cursor, such as reactive bindings
   * and event listeners. This method should be called when the cursor is no longer needed
   * to prevent memory leaks.
   */
  public cleanup() {
    this.onCleanupCallbacks.forEach((callback) => {
      callback()
    })
    this.onCleanupCallbacks = []
  }

  /**
   * Registers a cleanup callback to be executed when the `cleanup` method is called.
   * Useful for managing resources and ensuring proper cleanup of bindings or listeners.
   * @param callback - A function to be executed during cleanup.
   */
  public onCleanup(callback: () => void) {
    this.onCleanupCallbacks.push(callback)
  }

  /**
   * Iterates over each item in the cursor's result set, applying the provided callback
   * function to each transformed item.
   * ⚡️ this function is reactive!
   * @param callback - A function to execute for each item in the result set.
   * @param callback.item - The transformed item.
   * @returns A promise that resolves when all items have been processed, or void if not in async mode.
   */
  public forEach(callback: (item: U) => void): Async extends true ? Promise<void> : void {
    this.depend({
      addedBefore: true,
      removed: true,
      movedBefore: true,
      ...this.options.fieldTracking ? {} : { changed: true },
    })

    const executeForEach = (items: T[]) => {
      items.forEach((item) => {
        callback(this.transform(item))
      })
    }

    const result = this.getItems()
    if (result instanceof Promise) {
      return result.then(executeForEach) as Async extends true ? Promise<void> : void
    } else {
      executeForEach(result)
      return undefined as Async extends true ? Promise<void> : void
    }
  }

  /**
   * Creates a new array populated with the results of applying the provided callback
   * function to each transformed item in the cursor's result set.
   * ⚡️ this function is reactive!
   * @template V - The type of the items in the resulting array.
   * @param callback - A function to execute for each item in the result set.
   * @param callback.item - The transformed item.
   * @returns An array of results after applying the callback to each item.
   */
  public map<V>(callback: (item: U) => V): Async extends true ? Promise<V[]> : V[] {
    const results: V[] = []
    const maybePromise = this.forEach((item) => {
      results.push(callback(item))
    })
    if (maybePromise instanceof Promise) {
      return maybePromise.then(() => results) as Async extends true ? Promise<V[]> : V[]
    }
    return results as Async extends true ? Promise<V[]> : V[]
  }

  /**
   * Fetches all transformed items from the cursor's result set as an array.
   * Automatically applies filtering, sorting, and limiting as per the cursor's options.
   * ⚡️ this function is reactive!
   * @returns An array of transformed items in the result set.
   */
  public fetch(): Async extends true ? Promise<U[]> : U[] {
    return this.map(item => item)
  }

  /**
   * Counts the total number of items in the cursor's result set after applying
   * filtering and other criteria.
   * ⚡️ this function is reactive!
   * @returns The total number of items in the result set.
   */
  public count(): Async extends true ? Promise<number> : number {
    this.depend({
      added: true,
      removed: true,
    })
    const maybePromise = this.getItems()
    return (maybePromise instanceof Promise
      ? maybePromise.then(items => items.length)
      : maybePromise.length) as Async extends true ? Promise<number> : number
  }

  /**
   * Observes changes to the cursor's result set and triggers the specified callbacks
   * when items are added, removed, or updated. Supports reactivity and transformation.
   * @param callbacks - An object containing the callback functions to handle different change events.
   * @param callbacks.added - Triggered when an item is added to the result set.
   * @param callbacks.removed - Triggered when an item is removed from the result set.
   * @param callbacks.changed - Triggered when an item in the result set is modified.
   * @param callbacks.addedBefore - Triggered when an item is added before another item in the result set.
   * @param callbacks.movedBefore - Triggered when an item is moved before another item in the result set.
   * @param callbacks.changedField - Triggered when a specific field of an item changes.
   * @param skipInitial - A boolean indicating whether to skip the initial notification of the current result set.
   * @returns A function to stop observing changes.
   */
  public observeChanges(callbacks: ObserveCallbacks<U>, skipInitial = false) {
    return this.observeRawChanges(Object
      .entries(callbacks)
      .reduce((memo, [callbackName, callback]) => {
        if (!callback) return memo
        return {
          ...memo,
          [callbackName]: (item: T, before: T | undefined) => {
            const transformedValue = this.transform(item)
            const hasBeforeParameter = before !== undefined
            const transformedBeforeValue = hasBeforeParameter && before
              ? this.transform(before)
              : null
            return callback(
              transformedValue,
              ...hasBeforeParameter ? [transformedBeforeValue] : [],
            )
          },
        }
      }, {}), skipInitial)
  }

  /**
   * Forces the cursor to re-evaluate its result set by re-fetching items
   * from the collection. This is useful when the underlying data or query
   * criteria have changed, and you want to ensure the cursor reflects the latest state.
   */
  public requery() {
    if (!this.observer) return
    this.observer.runChecks(this.getItems)
  }
}
