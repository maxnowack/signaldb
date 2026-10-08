import isEqual from '../utils/isEqual'
import uniqueBy from '../utils/uniqueBy'
import {
  applyQueryDelta,
  canApplyQueryDelta,
  diffQueryResults,
  isEmptyQueryDelta,
} from '../utils/queryDelta'
import type { QueryDelta } from '../utils/queryDelta'

type AddedCallback<T> = (item: T) => void
type AddedBeforeCallback<T> = (item: T, before: T) => void
type ChangedCallback<T> = (item: T, before: T) => void
type ChangedFieldCallback<T> = <Field extends keyof T>(
  item: T,
  field: Field,
  oldValue: T[Field],
  newValue: T[Field],
) => void
type MovedBeforeCallback<T> = (item: T, before: T) => void
type RemovedCallback<T> = (item: T) => void

export interface ObserveCallbacks<T> {
  added?: AddedCallback<T>,
  addedBefore?: AddedBeforeCallback<T>,
  changed?: ChangedCallback<T>,
  changedField?: ChangedFieldCallback<T>,
  movedBefore?: MovedBeforeCallback<T>,
  removed?: RemovedCallback<T>,
}

interface CallbackWithOptions<T> {
  callback: T,
  options: {
    skipInitial?: boolean,
    isInitial: boolean,
  },
}

/**
 * Represents an observer that tracks changes in a collection of items and triggers
 * callbacks for various events such as addition, removal, and modification of items.
 * @template T - The type of the items being observed, which must include an `id` field.
 */
export default class Observer<T extends { id: any }> {
  private previousItems: T[] = []
  private hasCheckedResult = false
  private observationCount = 0
  private callbacks: {
    added: CallbackWithOptions<AddedCallback<T>>[],
    addedBefore: CallbackWithOptions<AddedBeforeCallback<T>>[],
    changed: CallbackWithOptions<ChangedCallback<T>>[],
    changedField: CallbackWithOptions<ChangedFieldCallback<T>>[],
    movedBefore: CallbackWithOptions<MovedBeforeCallback<T>>[],
    removed: CallbackWithOptions<RemovedCallback<T>>[],
  }

  private unbindEvents: () => void
  private stopped = false

  /**
   * Creates a new instance of the `Observer` class.
   * Sets up event bindings and initializes the callbacks for tracking changes in a collection.
   * @param bindEvents - A function to bind external events to the observer. Must return a cleanup function to unbind those events.
   */
  constructor(bindEvents: () => () => void) {
    this.callbacks = {
      added: [],
      addedBefore: [],
      changed: [],
      changedField: [],
      movedBefore: [],
      removed: [],
    }
    this.unbindEvents = bindEvents()
  }

  private call<
    K extends keyof(
      typeof this.callbacks
    ),
  >(
    event: K,
    ...args: Parameters<NonNullable<ObserveCallbacks<T>[K]>>
  ) {
    const callbacks = this.callbacks[event]
    for (const { callback, options } of callbacks) {
      // execute only if it's not initial call or if initial call should not be skipped
      if (!options.skipInitial || !options.isInitial) {
        callback(...args as [T, T & keyof T, T[keyof T], T[keyof T]])
      }
    }
  }

  private hasCallbacks(events: (keyof ObserveCallbacks<T>)[]) {
    return events.some(event => this.callbacks[event].length > 0)
  }

  /**
   * Reports a delta and adopts the result it produces.
   *
   * The single place the callbacks are fired from, whether the change arrived as a delta or was
   * found by comparing two results — so the two can never disagree about what a consumer is told.
   * @param delta - The change to report.
   * @param nextItems - The result the delta produces.
   */
  private emitDelta(delta: QueryDelta<T>, nextItems: T[]) {
    if (this.isEmpty()) {
      this.finishCheck(nextItems)
      return
    }

    const beforeOf = (index: number) => nextItems[index + 1] || null
    // Indexing the previous result costs its whole length, and most deltas do not need it: only a
    // listener that is told what an item looked like before — 'changed', 'changedField' or
    // 'removed' — needs the previous result at all.
    const isNeedsPreviousItems = (delta.removed.length > 0 && this.hasCallbacks(['removed']))
      || (delta.changed.length > 0 && this.hasCallbacks(['changed', 'changedField']))
    const previousById = isNeedsPreviousItems
      ? new Map(this.previousItems.map(item => [item.id, item]))
      : null

    if (this.hasCallbacks(['changed', 'changedField'])) {
      for (const item of delta.changed) {
        const oldItem = previousById?.get(item.id)
        if (!oldItem) continue
        this.call('changed', item, oldItem)
        if (!this.hasCallbacks(['changedField'])) continue
        const keys = uniqueBy([
          ...Object.keys(item) as (keyof T)[],
          ...Object.keys(oldItem) as (keyof T)[],
        ], value => value)
        for (const key of keys) {
          if (isEqual(item[key], oldItem[key])) continue
          this.call('changedField', item, key, oldItem[key], item[key])
        }
      }
    }

    if (this.hasCallbacks(['removed'])) {
      for (const id of delta.removed) {
        const oldItem = previousById?.get(id)
        if (oldItem) this.call('removed', oldItem)
      }
    }

    if (this.hasCallbacks(['added', 'addedBefore'])) {
      for (const { index, item } of delta.added) {
        this.call('added', item)
        this.call('addedBefore', item, beforeOf(index))
      }
    }

    if (this.hasCallbacks(['movedBefore'])) {
      for (const { index } of delta.moved) {
        this.call('movedBefore', nextItems[index], beforeOf(index))
      }
    }

    this.finishCheck(nextItems)
  }

  private finishCheck(newItems: T[]) {
    // Store new items as previous items for next check
    this.previousItems = newItems
    this.hasCheckedResult = true
    for (const key of Object.keys(this.callbacks)) {
      const event = key as keyof ObserveCallbacks<T>
      const callbacks = this.callbacks[event]
      this.callbacks[event] = callbacks.map(callback => ({
        ...callback,
        options: {
          ...callback.options,
          isInitial: false,
        },
      })) as any
    }
  }

  private checkItems(newItems: T[]) {
    // Derives the change and reports it through the same path a change that arrived ready-made
    // takes. Comparing and then reporting item by item, as this used to, meant the two paths could
    // describe the same change differently — most visibly in how many moves they reported.
    this.emitDelta(diffQueryResults(this.previousItems, newItems), newItems)
  }

  /**
   * Determines if the observer has no active callbacks registered for any events.
   * @returns A boolean indicating whether the observer is empty (i.e., no callbacks are registered).
   */
  public isEmpty() {
    return !this.hasCallbacks([
      'added',
      'addedBefore',
      'changed',
      'changedField',
      'movedBefore',
      'removed',
    ])
  }

  /**
   * Whether anything still observes the query, including an observation without callbacks, which
   * keeps the query live without listening to it.
   * @returns `true` while at least one set of callbacks is registered.
   */
  public isObserved() {
    return this.observationCount > 0
  }

  /**
   * Whether the observer has completed a check and so holds a result to compare against.
   * @returns `true` once the first check has finished.
   */
  public hasResult() {
    return this.hasCheckedResult
  }

  /**
   * Compares the previous state of items with the new state and triggers the appropriate callbacks
   * for events such as added, removed, changed, or moved items.
   * @param getItems - A function that returns a promise resolving to the new items or the items themselves.
   */
  public runChecks(getItems: () => Promise<T[]> | T[]) {
    const result = getItems()
    if (result instanceof Promise) {
      result
        // eslint-disable-next-line unicorn/prefer-await -- keeps the microtask the check emits in
        .then(newItems => this.checkItems(newItems))
        // eslint-disable-next-line unicorn/prefer-await -- keeps the microtask the check emits in
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Error while asynchronously querying items', error)
        })
    } else {
      this.checkItems(result)
    }
  }

  /**
   * Brings the observer up to date from a description of what changed, instead of from the new
   * result.
   *
   * `runChecks` has to rediscover the change by comparing the whole new result against the whole
   * old one — a cost proportional to the result, paid on every write, to find out that one row
   * moved. When the change is already known it can simply be reported, and the cost becomes
   * proportional to the change.
   *
   * The delta must have been computed against exactly the result this observer holds. If it was
   * not, this reports nothing, falls back to `runChecks`, and returns `false`.
   *
   * Note that the reported moves are minimal, where a comparison reports every item whose
   * neighbour changed. Applying them yields the same order either way — there are simply fewer of
   * them.
   * @param delta - The change to report.
   * @param getItems - Used to fall back to a comparison when the delta cannot be applied.
   * @returns Whether the delta was applied.
   */
  public applyDelta(delta: QueryDelta<T>, getItems: () => Promise<T[]> | T[]): boolean {
    if (!canApplyQueryDelta(this.previousItems, delta)) {
      this.runChecks(getItems)
      return false
    }
    if (isEmptyQueryDelta(delta)) return true

    this.emitDelta(delta, applyQueryDelta(this.previousItems, delta))
    return true
  }

  /**
   * Stops the observer by unbinding all events and cleaning up resources.
   * Safe to call multiple times - will only unbind once.
   */
  public stop() {
    if (this.stopped) return
    this.stopped = true
    this.unbindEvents()
  }

  /**
   * Registers callbacks for specific events to observe changes in the collection.
   * @param callbacks - An object containing the callbacks for various events (e.g., 'added', 'removed').
   * @param shouldSkipInitial - A boolean indicating whether to skip invoking the callbacks for the initial state of the collection.
   */
  public addCallbacks(callbacks: ObserveCallbacks<T>, shouldSkipInitial = false) {
    this.observationCount += 1
    for (const key of Object.keys(callbacks)) {
      const typedKey = key as keyof ObserveCallbacks<T>
      this.callbacks[typedKey].push({
        callback: callbacks[typedKey] as any,
        options: { skipInitial: shouldSkipInitial, isInitial: !this.hasCheckedResult },
      })
    }
  }

  /**
   * Removes the specified callbacks for specific events, unregistering them from the observer.
   * @param callbacks - An object containing the callbacks to be removed for various events.
   */
  public removeCallbacks(callbacks: ObserveCallbacks<T>) {
    this.observationCount = Math.max(0, this.observationCount - 1)
    for (const key of Object.keys(callbacks)) {
      const typedKey = key as keyof ObserveCallbacks<T>
      const index = this.callbacks[typedKey]
        .findIndex(({ callback }) => callback === callbacks[typedKey])
      this.callbacks[typedKey].splice(index, 1)
    }
  }
}
