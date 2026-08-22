import type ReactivityAdapter from '../types/ReactivityAdapter'
import type { QueryDelta } from '../utils/queryDelta'
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

/**
 * Reports whether the query a cursor stands for has produced an outcome yet.
 * Supplied by the collection, which owns the query registration; a cursor
 * built without one simply never reports itself as loading.
 */
export interface QueryStateAccessor {
  /**
   * Whether the query has settled — completed or failed — at least once
   * since it was registered.
   */
  hasSettled: () => boolean,
  /**
   * Subscribes to the query settling. Returns a cleanup function.
   */
  onSettled: (callback: () => void) => () => void,
}

export interface CursorOptions<
  T extends BaseItem,
  U = T,
  Async extends boolean = false,
> extends FindOptions<T, Async> {
  transform?: Transform<T, U>,
  bindEvents?: (
    requery: () => void,
    applyDelta: (delta: QueryDelta<T>) => void,
  ) => () => void,
  queryState?: QueryStateAccessor,
}

/**
 * Represents a cursor for querying and observing a filtered, sorted, and transformed
 * subset of items from a collection. Supports reactivity and field tracking.
 * @template T - The type of the items in the collection.
 * @template U - The transformed item type after applying transform (default is T).
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
   * @param options.transformAll - A function that will be able to solve the n+1 problem
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
    bindExtraNotifier?: (notify: () => void) => () => void,
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

    // A notifier that isn't driven by the result set itself — `isLoading()`
    // needs to re-run its scope when the query settles, which is precisely
    // the moment the result set may *not* have changed (an empty query
    // completing produces no diff, so the observer above stays silent).
    if (!bindExtraNotifier) return
    const stopExtraNotifier = bindExtraNotifier(notify)
    if (this.options.reactive.onDispose) {
      this.options.reactive.onDispose(() => stopExtraNotifier(), signal)
    }
    this.onCleanup(stopExtraNotifier)
  }

  private ensureObserver() {
    if (!this.observer) {
      const observer = new Observer<T>(() => {
        const requery = () => {
          observer.runChecks(this.getItems)
        }
        const applyDelta = (delta: QueryDelta<T>) => {
          observer.applyDelta(delta, this.getItems)
        }
        const cleanup = this.options.bindEvents
          && this.options.bindEvents(requery, applyDelta)
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
   * Whether this cursor's query has yet to deliver a first result.
   * ⚡️ this function is reactive!
   *
   * An asynchronous data adapter answers a newly registered query only after a
   * round trip, and serves a neutral empty result until it does — which a
   * consumer cannot otherwise tell apart from "there is nothing to show". This
   * is that distinction, per query rather than per collection, so one screen
   * waiting on its own data says nothing about any other query.
   *
   * Follows the usual `isLoading`/`isFetching` split: it reports "no result
   * yet", not "an execution is in flight". A write that re-runs an
   * already-settled query drives it through `'active'` again while this stays
   * `false`, so a list does not fall back to a loading state every time one of
   * its rows changes.
   *
   * A query that fails counts as settled — the `query.error` event on the
   * collection is what surfaces the failure, and a loading state that never
   * ends is the worse answer. Reading this registers the query if nothing else
   * has, so it cannot wait on something nobody asked for. It is always `false`
   * for an `{ async: true }` cursor, whose `fetch()` awaits the real result
   * anyway, and for a data adapter that answers synchronously.
   * @returns A boolean indicating whether the first result is still pending.
   */
  public isLoading(): boolean {
    const queryState = this.options.queryState
    if (!queryState || this.options.async) return false
    this.depend({}, notify => queryState.onSettled(notify))
    return !queryState.hasSettled()
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
  public observeChanges(callbacks: ObserveCallbacks<T>, skipInitial = false) {
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

  /**
   * Brings the cursor up to date from a description of what changed, rather than by re-running the
   * query and comparing the result with the previous one.
   *
   * Falls back to `requery` when the delta does not fit the result the cursor currently holds, so
   * a caller never has to decide which of the two is safe.
   * @param delta - The change to apply.
   */
  public applyDelta(delta: QueryDelta<T>) {
    if (!this.observer) return
    this.observer.applyDelta(delta, this.getItems)
  }
}
