import type Selector from '../types/Selector'
import sortItems from '../utils/sortItems'
import project from '../utils/project'
import match from '../utils/match'
import type ReactivityAdapter from '../types/ReactivityAdapter'
import type { BaseItem, FindOptions, Transform } from './types'
import type { ObserveCallbacks } from './Observer'
import Observer from './Observer'

function isInReactiveScope(reactivity: ReactivityAdapter | undefined | false) {
  if (!reactivity) return false // if reactivity is disabled we don't need to check
  if (!reactivity.isInScope) return true // if reactivity is enabled and no isInScope method is provided we assume it is in scope
  return reactivity.isInScope() // if reactivity is enabled and isInScope method is provided we check if it is in scope
}

export interface CursorOptions<T extends BaseItem, U = T> extends FindOptions<T> {
  transform?: Transform<T, U>,
  bindEvents?: (requery: () => void) => () => void,
}

export default class Cursor<T extends BaseItem, U = T> {
  private observers: Observer<T>[] = []
  private getAllItems: () => T[]
  private selector: Selector<T>
  private options: CursorOptions<T, U>
  private onCleanupCallbacks: (() => void)[] = []

  constructor(
    getAllItems: () => T[],
    selector: Selector<T>,
    options?: CursorOptions<T, U>,
  ) {
    this.getAllItems = getAllItems
    this.selector = selector
    this.options = options || {}
  }

  private filterItems(items: T[]) {
    const { selector } = this
    return items.filter((item) => {
      if (!selector) return true
      const matches = match(item, selector)
      return matches
    })
  }

  private transform(item: T): U {
    if (!this.options.transform) return item as unknown as U
    return this.options.transform(item)
  }

  private getItems() {
    const allItems = this.getAllItems()
    const filtered = this.filterItems(allItems)
    const { sort, skip, limit } = this.options
    const sorted = sort ? sortItems(filtered, sort) : filtered
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped
    return limited.map(item => (this.options.fields ? project(item, this.options.fields) : item))
  }

  private depend(changeEvents: { [P in keyof ObserveCallbacks<U>]?: true }) {
    if (!this.options.reactive) return
    if (!isInReactiveScope(this.options.reactive)) return
    const signal = this.options.reactive.create()
    signal.depend()
    const notify = () => signal.notify()

    const enabledEvents = Object.entries(changeEvents)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .reduce((memo, key) => ({ ...memo, [key]: notify }), {})
    const stop = this.observeChanges(enabledEvents, true)
    if (this.options.reactive.onDispose) {
      this.options.reactive.onDispose(() => stop(), signal)
    }
    this.onCleanup(stop)
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
      changed: true,
      movedBefore: true,
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
    const transformedCallbacks = Object
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
      }, {}) as ObserveCallbacks<T>
    const observer = new Observer(
      transformedCallbacks,
      () => {
        const cleanup = this.options.bindEvents
          && this.options.bindEvents(() => observer.check(this.getItems()))
        return () => {
          if (cleanup) cleanup()
        }
      },
      skipInitial,
    )
    this.observers.push(observer)
    observer.check(this.getItems())
    this.onCleanup(() => observer.stop())

    return () => {
      observer.stop()
      this.observers = this.observers.filter(o => o !== observer)
    }
  }

  public requery() {
    const items = this.getItems()
    this.observers.forEach(observer => observer.check(items))
  }
}
