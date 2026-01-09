import isEqual from '../utils/isEqual'
import uniqueBy from '../utils/uniqueBy'

type AddedCallback<T> = (item: T) => void
type AddedBeforeCallback<T> = (item: T, before: T) => void
type ChangedCallback<T> = (item: T) => void
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
  private callbacks: {
    added: CallbackWithOptions<AddedCallback<T>>[],
    addedBefore: CallbackWithOptions<AddedBeforeCallback<T>>[],
    changed: CallbackWithOptions<ChangedCallback<T>>[],
    changedField: CallbackWithOptions<ChangedFieldCallback<T>>[],
    movedBefore: CallbackWithOptions<MovedBeforeCallback<T>>[],
    removed: CallbackWithOptions<RemovedCallback<T>>[],
  }

  private unbindEvents: () => void

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
    this.callbacks[event].forEach(({ callback, options }) => {
      // execute only if it's not initial call or if initial call should not be skipped
      if (!options.skipInitial || !options.isInitial) {
        callback(...args as [T, T & keyof T, T[keyof T], T[keyof T]])
      }
    })
  }

  private hasCallbacks(events: (keyof ObserveCallbacks<T>)[]) {
    return events.some(event => this.callbacks[event].length > 0)
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
   * Compares the previous state of items with the new state and triggers the appropriate callbacks
   * for events such as added, removed, changed, or moved items.
   * @param getItems - A function that returns a promise resolving to the new items or the items themselves.
   */
  public runChecks(getItems: () => Promise<T[]> | T[]) {
    const result = getItems()
    if (result instanceof Promise) {
      result
        .then(newItems => this.checkItems(newItems))
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Error while asynchronously querying items', error)
        })
    } else {
      this.checkItems(result)
    }
  }

  private checkItems(newItems: T[]) {
    const oldItemsMap = new Map(this.previousItems.map((item, index) => [
      item.id,
      { item, index, beforeItem: this.previousItems[index + 1] || null },
    ]))
    const newItemsMap = new Map(newItems.map((item, index) => [
      item.id,
      { item, index, beforeItem: newItems[index + 1] || null },
    ]))

    if (this.hasCallbacks(['changed', 'changedField', 'movedBefore', 'removed'])) {
      // Check for removed or changed items
      oldItemsMap.forEach(({ item: oldItem, index, beforeItem: oldBeforeItem }) => {
        const newItem = newItemsMap.get(oldItem.id)
        if (newItem) {
          if (this.hasCallbacks(['changed', 'changedField']) // If the item exists but has changed, call 'changed' callback
            && !isEqual(newItem.item, oldItem)) {
            this.call('changed', newItem.item)

            if (this.hasCallbacks(['changedField'])) {
              // check for changed fields and call 'changedField' callback
              const keys = uniqueBy([
                ...Object.keys(newItem.item) as (keyof T)[],
                ...Object.keys(oldItem) as (keyof T)[],
              ], value => value)
              keys.forEach((key) => {
                if (isEqual(newItem.item[key], oldItem[key])) return
                this.call('changedField', newItem.item, key, oldItem[key], newItem.item[key])
              })
            }
          }
          // If the item's beforeItem has changed, call 'movedBefore' callback
          if (newItem.index !== index && newItem.beforeItem?.id !== oldBeforeItem?.id) {
            this.call('movedBefore', newItem.item, newItem.beforeItem)
          }
        } else {
          // If the item no longer exists, call 'removed' callback
          this.call('removed', oldItem)
        }
      })
    }

    if (this.hasCallbacks(['added', 'addedBefore'])) {
      // Check for added items
      newItems.forEach((newItem, index) => {
        const oldItem = oldItemsMap.get(newItem.id)
        if (oldItem) return

        // If the item is newly added, call 'added' and 'addedBefore' callbacks
        this.call('added', newItem)
        this.call('addedBefore', newItem, newItems[index + 1] || null)
      })
    }

    // Store new items as previous items for next check
    this.previousItems = newItems
    Object.keys(this.callbacks).forEach((key) => {
      const event = key as keyof ObserveCallbacks<T>
      const callbacks = this.callbacks[event]
      this.callbacks[event] = callbacks.map(callback => ({
        ...callback,
        options: {
          ...callback.options,
          isInitial: false,
        },
      }) as typeof callback) as any
    })
  }

  /**
   * Stops the observer by unbinding all events and cleaning up resources.
   */
  public stop() {
    this.unbindEvents()
  }

  /**
   * Registers callbacks for specific events to observe changes in the collection.
   * @param callbacks - An object containing the callbacks for various events (e.g., 'added', 'removed').
   * @param skipInitial - A boolean indicating whether to skip invoking the callbacks for the initial state of the collection.
   */
  public addCallbacks(callbacks: ObserveCallbacks<T>, skipInitial = false) {
    Object.keys(callbacks).forEach((key) => {
      const typedKey = key as keyof ObserveCallbacks<T>
      this.callbacks[typedKey].push({
        callback: callbacks[typedKey] as any,
        options: { skipInitial, isInitial: true },
      })
    })
  }

  /**
   * Removes the specified callbacks for specific events, unregistering them from the observer.
   * @param callbacks - An object containing the callbacks to be removed for various events.
   */
  public removeCallbacks(callbacks: ObserveCallbacks<T>) {
    Object.keys(callbacks).forEach((key) => {
      const typedKey = key as keyof ObserveCallbacks<T>
      const index = this.callbacks[typedKey]
        .findIndex(({ callback }) => callback === callbacks[typedKey])
      this.callbacks[typedKey].splice(index, 1)
    })
  }
}
