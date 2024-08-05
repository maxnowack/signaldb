import type { BaseItem } from './Collection'
import type { ReplicatedCollectionOptions } from './ReplicatedCollection'
import ReplicatedCollection from './ReplicatedCollection'
import type ReactivityAdapter from './types/ReactivityAdapter'
import type Signal from './types/Signal'
import type Selector from './types/Selector'
import uniqueBy from './utils/uniqueBy'
import createSignal from './utils/createSignal'
import isEqual from './utils/isEqual'

interface AutoFetchOptions<T extends { id: I } & Record<string, any>, I> {
  fetchQueryItems: (selector: Selector<T>) => ReturnType<ReplicatedCollectionOptions<T, I>['pull']>,
}
export type AutoFetchCollectionOptions<
  T extends BaseItem<I>,
  I,
  U = T,
> = Omit<ReplicatedCollectionOptions<T, I, U>, 'pull'> & AutoFetchOptions<T, I>

export default class AutoFetchCollection<
  T extends BaseItem<I> = BaseItem,
  I = any,
  U = T,
> extends ReplicatedCollection<T, I, U> {
  private activeObservers = new Map<string, number>()
  private idQueryCache = new Map<I, Selector<T>[]>()
  private itemsCache: T[] = []
  private fetchQueryItems: (selector: Selector<T>) => ReturnType<ReplicatedCollectionOptions<T, I>['pull']>
  private triggerReload: null | (() => void | Promise<void>) = null
  private reactivityAdapter: ReactivityAdapter | null = null
  private loadingSignals = new Map<string, Signal<boolean>>()

  constructor(options: AutoFetchCollectionOptions<T, I, U>) {
    let triggerRemoteChange: (() => Promise<void> | void) | undefined
    super({
      ...options,
      pull: () => Promise.resolve({ items: this.itemsCache }),
      registerRemoteChange: async (onChange) => {
        triggerRemoteChange = onChange
        if (options.registerRemoteChange) await options.registerRemoteChange(onChange)
      },
    })
    if (!triggerRemoteChange) throw new Error('No triggerRemoteChange method found. Looks like your persistence adapter was not registered')
    this.triggerReload = triggerRemoteChange
    this.reactivityAdapter = options.reactivity ?? null

    this.fetchQueryItems = options.fetchQueryItems
    this.on('observer.created', selector => this.handleObserverCreation(selector ?? {}))
    this.on('observer.disposed', selector => this.handleObserverDisposal(selector ?? {}))
  }

  private handleObserverCreation(selector: Selector<T>) {
    const activeObservers = this.activeObservers.get(JSON.stringify(selector)) ?? 0
    // increment the count of observers for this query
    this.activeObservers.set(JSON.stringify(selector), activeObservers + 1)

    // if this is the first observer for this query, fetch the data
    if (activeObservers === 0) {
      this.fetchQueryItems(selector)
        .then((response) => {
          if (!response.items) throw new Error('AutoFetchCollection currently only works with a full item response')

          // merge the response into the cache
          this.itemsCache = uniqueBy([...response.items, ...this.itemsCache], 'id')

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
    }
  }

  private handleObserverDisposal(selector: Selector<T>) {
    const activeObservers = this.activeObservers.get(JSON.stringify(selector)) ?? 0
    if (activeObservers > 1) {
      // decrement the count of observers for this query
      this.activeObservers.set(JSON.stringify(selector), activeObservers - 1)
      return
    }

    // if this is the last observer for this query, remove the query from the cache
    this.activeObservers.delete(JSON.stringify(selector))

    // remove the query from the cache
    this.idQueryCache.forEach((queries, id) => {
      const updatedQueries = queries.filter(query => !isEqual(query, selector))
      if (updatedQueries.length === 0) {
        this.idQueryCache.delete(id)
        this.itemsCache = this.itemsCache.filter(item => item.id !== id)
      } else {
        this.idQueryCache.set(id, updatedQueries)
      }
    })

    if (!this.triggerReload) throw new Error('No triggerReload method found. Looks like your persistence adapter was not registered')
    void this.triggerReload()
  }

  private ensureSignal(selector: Selector<T>) {
    if (!this.reactivityAdapter) throw new Error('No reactivity adapter found')
    if (!this.loadingSignals.has(JSON.stringify(selector))) {
      this.loadingSignals.set(
        JSON.stringify(selector),
        createSignal(this.reactivityAdapter.create(), false),
      )
    }
    return this.loadingSignals.get(JSON.stringify(selector)) as Signal<boolean>
  }

  private setLoading(selector: Selector<T>, value: boolean) {
    const signal = this.ensureSignal(selector)
    signal.set(value)
  }

  public isLoading(selector?: Selector<T>) {
    if (!selector) return super.isLoading()
    const signal = this.ensureSignal(selector)
    return signal.get()
  }
}
