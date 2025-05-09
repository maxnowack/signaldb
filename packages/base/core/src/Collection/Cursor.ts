import sortItems from '../utils/sortItems'
import project from '../utils/project'
import deepClone from '../utils/deepClone'
import type ReactivityAdapter from '../types/ReactivityAdapter'
import type { BaseItem, FindOptions, Transform, TransformAll } from './types'
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
  E extends BaseItem = T,
  U = E,
> extends FindOptions<T> {
  transformAll?: TransformAll<T, E>,
  transform?: Transform<E, U>,
  bindEvents?: (requery: () => void) => () => void,
}

/**
 * Represents a cursor for querying and observing a filtered, sorted, and transformed
 * subset of items from a collection. Supports reactivity and field tracking.
 * @template T - The type of the items in the collection.
 * @template E - The transformed item type after applying transformAll (default is T).
 * @template U - The transformed item type after applying transform (default is E).
 */
export default class Cursor<T extends BaseItem, E extends BaseItem = T, U = E> {
  private observer: Observer<E> | undefined
  private getFilteredItems: () => T[]
  private options: CursorOptions<T, E, U>
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
    getItems: () => T[],
    options?: CursorOptions<T, E, U>,
  ) {
    this.getFilteredItems = getItems
    this.options = options || {}
  }

  private addGetters(item: E) {
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
    }, {}) as E
  }

  private transform(rawItem: E): U {
    const item = this.options.fieldTracking
      ? this.addGetters(rawItem)
      : rawItem
    if (!this.options.transform) return item as unknown as U
    return this.options.transform(item)
  }

  private getItems() {
    const items = this.getFilteredItems()
    const { sort, skip, limit, transformAll, fields } = this.options
    const sorted = sort ? sortItems(items, sort) : items
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped
    const idExcluded = this.options.fields && this.options.fields.id === 0

    let entries = limited as unknown as E[]
    if (transformAll) {
      entries = transformAll(deepClone(limited), fields)
    }
    return entries.map((item) => {
      if (!this.options.fields) return item
      return {
        ...idExcluded ? {} : { id: item.id },
        ...project<E>(item, this.options.fields),
      }
    })
  }

  private depend(
    changeEvents: {
      [P in keyof ObserveCallbacks<E>]?: true
        | ((notify: () => void) => NonNullable<ObserveCallbacks<E>[P]>)
    },
  ) {
    if (!this.options.reactive) return
    if (!isInReactiveScope(this.options.reactive)) return
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

      return (...args: Parameters<NonNullable<ObserveCallbacks<E>[Event]>>) => {
        // if the event is just turned on with true, we can notify directly
        if (eventHandler === true) {
          notify()
          return
        }

        // if the event is something else than true or a function, we don't care about it
        if (typeof eventHandler !== 'function') return

        // if the event is a function, we call it with the notify function
        eventHandler(notify)(...args as [E, E & keyof E, E[keyof E], E[keyof E]])
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
      const observer = new Observer<E>(() => {
        const requery = () => {
          observer.runChecks(this.getItems())
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

  private observeRawChanges(callbacks: ObserveCallbacks<E>, skipInitial = false) {
    const observer = this.ensureObserver()
    observer.addCallbacks(callbacks, skipInitial)
    observer.runChecks(this.getItems())
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
   */
  public forEach(callback: (item: U) => void) {
    const items = this.getItems()
    this.depend({
      addedBefore: true,
      removed: true,
      movedBefore: true,
      ...this.options.fieldTracking ? {} : { changed: true },
    })
    items.forEach((item) => {
      callback(this.transform(item))
    })
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
  public map<V>(callback: (item: U) => V) {
    const results: V[] = []
    this.forEach((item) => {
      results.push(callback(item))
    })
    return results
  }

  /**
   * Fetches all transformed items from the cursor's result set as an array.
   * Automatically applies filtering, sorting, and limiting as per the cursor's options.
   * ⚡️ this function is reactive!
   * @returns An array of transformed items in the result set.
   */
  public fetch(): U[] {
    return this.map(item => item)
  }

  /**
   * Counts the total number of items in the cursor's result set after applying
   * filtering and other criteria.
   * ⚡️ this function is reactive!
   * @returns The total number of items in the result set.
   */
  public count() {
    const items = this.getItems()
    this.depend({
      added: true,
      removed: true,
    })
    return items.length
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
  public observeChanges(callbacks: ObserveCallbacks<E>, skipInitial = false) {
    return this.observeRawChanges(Object
      .entries(callbacks)
      .reduce((memo, [callbackName, callback]) => {
        if (!callback) return memo
        return {
          ...memo,
          [callbackName]: (item: E, before: E | undefined) => {
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
    this.observer.runChecks(this.getItems())
  }
}
