import type { BaseItem } from './Collection'
import type { ReplicatedCollectionOptions } from './ReplicatedCollection'
import ReplicatedCollection from './ReplicatedCollection'
import type ReactivityAdapter from './types/ReactivityAdapter'
import type Signal from './types/Signal'
import type Selector from './types/Selector'
import createSignal from './utils/createSignal'

interface AutoFetchOptions<T extends { id: I } & Record<string, any>, I> {
  fetchQueryItems: (selector: Selector<T>) => ReturnType<ReplicatedCollectionOptions<T, I>['pull']>,
  purgeDelay?: number,
  registerRemoteChange?: (onChange: () => Promise<void>) => Promise<void>,
  mergeItems?: (itemA: T, itemB: T) => T,
}
export type AutoFetchCollectionOptions<
  T extends BaseItem<I>,
  I,
  E extends BaseItem = T,
  U = E,
> = Omit<ReplicatedCollectionOptions<T, I, E, U>, 'pull' | 'registerRemoteChange'> & AutoFetchOptions<T, I>

/**
 * A special collection that automatically fetches items when they are needed.
 */
export default class AutoFetchCollection<
  T extends BaseItem<I> = BaseItem,
  I = any,
  E extends BaseItem = T,
  U = E,
> extends ReplicatedCollection<T, I, E, U> {
  private activeObservers = new Map<string, { selector: Selector<T>, count: number }>()
  private observerTimeouts = new Map<string, NodeJS.Timeout>()
  private purgeDelay: number
  private idQueryCache = new Map<I, Selector<T>[]>()
  private itemsCache = new Map<string, T[]>()
  private fetchQueryItems: (selector: Selector<T>) => ReturnType<ReplicatedCollectionOptions<T, I>['pull']>
  private triggerReload: null | (() => void | Promise<void>) = null
  private reactivityAdapter: ReactivityAdapter | null = null
  private loadingSignals = new Map<string, Signal<boolean>>()
  private isFetchingSignal: Signal<boolean>
  private mergeItems: (itemA: T, itemB: T) => T

  /**
   * @param options {Object} - Options for the collection.
   * @param options.fetchQueryItems {Function} - A function that fetches items from the server. It takes the selector as an argument and returns a promise that resolves to an object with an `items` property.
   * @param options.purgeDelay {Number} - The delay in milliseconds before purging an item from the cache.
   */
  constructor(options: AutoFetchCollectionOptions<T, I, E, U>) {
    let triggerRemoteChange: (() => Promise<void> | void) | undefined
    super({
      ...options,
      pull: () => Promise.resolve({
        items: [...this.itemsCache.values()].reduce((memo, items) => {
          const newItems = [...memo]
          items.forEach((item) => {
            const index = newItems.findIndex(i => i.id === item.id)
            if (index === -1) {
              newItems.push(item)
              return
            }
            newItems[index] = this.mergeItems(newItems[index], item)
          })
          return newItems
        }, []),
      }),
      registerRemoteChange: async (onChange) => {
        triggerRemoteChange = onChange
      },
    })
    this.mergeItems = options.mergeItems ?? ((itemA, itemB) => ({ ...itemA, ...itemB }))
    this.purgeDelay = options.purgeDelay ?? 10_000 // 10 seconds
    this.isFetchingSignal = createSignal(options.reactivity, false)
    if (!triggerRemoteChange) throw new Error('No triggerRemoteChange method found. Looks like your persistence adapter was not registered')
    this.triggerReload = triggerRemoteChange
    this.reactivityAdapter = options.reactivity ?? null

    this.fetchQueryItems = options.fetchQueryItems
    this.on('observer.created', selector => this.handleObserverCreation(selector ?? {}))
    this.on('observer.disposed', selector => setTimeout(() => this.handleObserverDisposal(selector ?? {}), 100))

    if (options.registerRemoteChange) {
      void options.registerRemoteChange(() => this.forceRefetch())
    }
  }

  /**
   * Registers a query manually that items should be fetched for it
   * @param selector {Object} Selector of the query
   */
  public registerQuery(selector: Selector<T>) {
    this.handleObserverCreation(selector)
  }

  /**
   * Unregisters a query manually that items are not fetched anymore for it
   * @param selector {Object} Selector of the query
   */
  public unregisterQuery(selector: Selector<T>) {
    this.handleObserverDisposal(selector)
  }

  private getKeyForSelector(selector: Selector<T>) {
    return JSON.stringify(selector)
  }

  private async forceRefetch() {
    return Promise.all([...this.activeObservers.values()].map(({ selector }) =>
      this.fetchSelector(selector))).then(() => { /* noop */ })
  }

  private fetchSelector(selector: Selector<T>) {
    this.isFetchingSignal.set(true)
    return this.fetchQueryItems(selector)
      .then((response) => {
        if (!response.items) throw new Error('AutoFetchCollection currently only works with a full item response')

        // merge the response into the cache
        this.itemsCache.set(this.getKeyForSelector(selector), response.items)

        response.items.forEach((item) => {
          const queries = this.idQueryCache.get(item.id) ?? []
          queries.push(selector)
          this.idQueryCache.set(item.id, queries)
        })

        this.setLoading(selector, true)
        this.once('persistence.received', () => {
          this.setLoading(selector, false)
        })
        if (!this.triggerReload) throw new Error('No triggerReload method found. Looks like your persistence adapter was not registered')
        void this.triggerReload()
      })
      .catch((error: Error) => {
        this.emit('persistence.error', error)
      })
      .finally(() => {
        this.isFetchingSignal.set(false)
      })
  }

  private handleObserverCreation(selector: Selector<T>) {
    const activeObservers = this.activeObservers.get(this.getKeyForSelector(selector))?.count ?? 0
    // increment the count of observers for this query
    this.activeObservers.set(this.getKeyForSelector(selector), {
      selector,
      count: activeObservers + 1,
    })
    const timeout = this.observerTimeouts.get(this.getKeyForSelector(selector))
    if (timeout) clearTimeout(timeout)

    // if this is the first observer for this query, fetch the data
    if (activeObservers === 0) void this.fetchSelector(selector)
  }

  private handleObserverDisposal(selector: Selector<T>) {
    // decrement the count of observers for this query
    const currentObservers = this.activeObservers.get(this.getKeyForSelector(selector))?.count ?? 0
    const activeObservers = currentObservers - 1
    if (activeObservers > 0) {
      this.activeObservers.set(this.getKeyForSelector(selector), {
        selector,
        count: activeObservers,
      })
      return
    }

    const timeout = this.observerTimeouts.get(this.getKeyForSelector(selector))
    if (timeout) clearTimeout(timeout)
    const removeObserver = () => {
      // if this is the last observer for this query and the purge delay was passed, remove the query from the cache
      this.activeObservers.delete(this.getKeyForSelector(selector))

      // remove items for query from the cache
      this.itemsCache.delete(this.getKeyForSelector(selector))

      if (!this.triggerReload) throw new Error('No triggerReload method found. Looks like your persistence adapter was not registered')
      void this.triggerReload()
    }
    if (this.purgeDelay === 0) {
      // remove the query from the cache immediately
      removeObserver()
      return
    }
    this.observerTimeouts.set(
      this.getKeyForSelector(selector),
      setTimeout(removeObserver, this.purgeDelay),
    )
  }

  private ensureSignal(selector: Selector<T>) {
    if (!this.reactivityAdapter) throw new Error('No reactivity adapter found')
    if (!this.loadingSignals.has(this.getKeyForSelector(selector))) {
      this.loadingSignals.set(
        this.getKeyForSelector(selector),
        createSignal(this.reactivityAdapter, false),
      )
    }
    return this.loadingSignals.get(this.getKeyForSelector(selector)) as Signal<boolean>
  }

  private setLoading(selector: Selector<T>, value: boolean) {
    const signal = this.ensureSignal(selector)
    signal.set(value)
  }

  /**
   * Indicates wether a query is currently been loaded
   * ⚡️ this function is reactive!
   * @param selector {Object} Selector of the query
   * @returns The loading state
   */
  public isLoading(selector?: Selector<T>) {
    const isPushing = this.isPushing()
    if (!selector) {
      return this.isFetchingSignal.get() || isPushing
    }
    const signal = this.ensureSignal(selector)
    return signal.get() || isPushing
  }
}
