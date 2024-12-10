import sortItems from '../utils/sortItems'
import project from '../utils/project'
import type ReactivityAdapter from '../types/ReactivityAdapter'
import type { BaseItem, FindOptions, Transform } from './types'
import type { ObserveCallbacks } from './Observer'
import Observer from './Observer'

export function isInReactiveScope(reactivity: ReactivityAdapter | undefined | false) {
  if (!reactivity) return false // if reactivity is disabled we don't need to check
  if (!reactivity.isInScope) return true // if reactivity is enabled and no isInScope method is provided we assume it is in scope
  return reactivity.isInScope() // if reactivity is enabled and isInScope method is provided we check if it is in scope
}

export interface CursorOptions<T extends BaseItem, U = T> extends FindOptions<T> {
  transform?: Transform<T, U>,
  bindEvents?: (requery: () => void) => () => void,
}

export default class Cursor<T extends BaseItem, U = T> {
  private observer: Observer<T> | undefined
  private getFilteredItems: () => T[]
  private options: CursorOptions<T, U>
  private onCleanupCallbacks: (() => void)[] = []

  constructor(
    getItems: () => T[],
    options?: CursorOptions<T, U>,
  ) {
    this.getFilteredItems = getItems
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

  private getItems() {
    const items = this.getFilteredItems()
    const { sort, skip, limit } = this.options
    const sorted = sort ? sortItems(items, sort) : items
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped
    const idExcluded = this.options.fields && this.options.fields.id === 0
    return limited.map((item) => {
      if (!this.options.fields) return item
      return {
        ...idExcluded ? {} : { id: item.id },
        ...project(item, this.options.fields),
      }
    })
  }

  private depend(
    changeEvents: {
      [P in keyof ObserveCallbacks<T>]?: true
        | ((notify: () => void) => NonNullable<ObserveCallbacks<T>[P]>)
    },
  ) {
    if (!this.options.reactive) return
    if (!isInReactiveScope(this.options.reactive)) return
    const signal = this.options.reactive.create()
    signal.depend()
    const notify = () => signal.notify()

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

  private observeRawChanges(callbacks: ObserveCallbacks<T>, skipInitial = false) {
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

  public cleanup() {
    this.onCleanupCallbacks.forEach((callback) => {
      callback()
    })
    this.onCleanupCallbacks = []
  }

  public onCleanup(callback: () => void) {
    this.onCleanupCallbacks.push(callback)
  }

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

  public map<V>(callback: (item: U) => V) {
    const results: V[] = []
    this.forEach((item) => {
      results.push(callback(item))
    })
    return results
  }

  public fetch(): U[] {
    return this.map(item => item)
  }

  public count() {
    const items = this.getItems()
    this.depend({
      added: true,
      removed: true,
    })
    return items.length
  }

  public observeChanges(callbacks: ObserveCallbacks<U>, skipInitial = false) {
    return this.observeRawChanges(Object
      .entries(callbacks)
      .reduce((memo, [callbackName, callback]) => {
        if (!callback) return memo
        return {
          ...memo,
          [callbackName]: (item: T, before: T | undefined) => {
            const transformedValue = this.transform(item)
            const hasBeforeParam = before !== undefined
            const transformedBeforeValue = hasBeforeParam && before
              ? this.transform(before)
              : null
            return callback(
              transformedValue,
              ...hasBeforeParam ? [transformedBeforeValue] : [],
            )
          },
        }
      }, {}), skipInitial)
  }

  public requery() {
    if (!this.observer) return
    this.observer.runChecks(this.getItems())
  }
}
