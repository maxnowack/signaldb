import Collection from './Collection'
import type { BaseItem, CollectionOptions } from './Collection'
import type { Changeset, LoadResponse } from './types/PersistenceAdapter'
import combinePersistenceAdapters from './persistence/combinePersistenceAdapters'
import createPersistenceAdapter from './persistence/createPersistenceAdapter'
import type Signal from './types/Signal'
import createSignal from './utils/createSignal'

interface ReplicationOptions<T extends { id: I } & Record<string, any>, I> {
  pull: () => Promise<LoadResponse<T>>,
  push?(changes: Changeset<T>, items: T[]): Promise<void>,
  registerRemoteChange?: (
    onChange: (data?: LoadResponse<T>) => void | Promise<void>,
  ) => Promise<void>,
}

/**
 * Creates a persistence adapter for replicating a collection, enabling pull and push
 * operations for synchronizing with a remote source. Supports optional remote change registration.
 * @template T - The type of the items being replicated.
 * @template I - The type of the unique identifier for the items.
 * @param options - The options for configuring the replication adapter.
 * @param options.pull - A function to fetch data from the remote source.
 * @param options.push - An optional function to send changes and items to the remote source.
 * @param options.registerRemoteChange - An optional function to register a listener for remote changes.
 * @returns A persistence adapter configured for replication.
 */
export function createReplicationAdapter<T extends { id: I } & Record<string, any>, I>(
  options: ReplicationOptions<T, I>,
) {
  return createPersistenceAdapter({
    async register(onChange) {
      if (!options.registerRemoteChange) return
      await options.registerRemoteChange(onChange)
    },
    load: () => options.pull(),
    save: (items, changes) => {
      if (!options.push) throw new Error('Pushing is not configured for this collection. Try to pass a `push` function to the collection options.')
      return options.push(changes, items)
    },
  })
}

export type ReplicatedCollectionOptions<
  T extends BaseItem<I>,
  I,
  E extends BaseItem = T,
  U = E,
> = CollectionOptions<T, I, E, U> & ReplicationOptions<T, I>

/**
 * Extends the `Collection` class to support replication with remote sources.
 * Handles pull and push operations, remote change registration, and enhanced loading states.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @template U - The transformed item type after applying transformations (default is T).
 */
export default class ReplicatedCollection<
  T extends BaseItem<I> = BaseItem,
  I = any,
  E extends BaseItem = T,
  U = E,
> extends Collection<T, I, E, U> {
  private isPullingRemoteSignal: Signal<boolean>
  private isPushingRemoteSignal: Signal<boolean>

  /**
   * Creates a new instance of the `ReplicatedCollection` class.
   * Sets up the replication adapter, combining it with an optional persistence adapter, and
   * initializes signals for tracking remote pull and push operations.
   * @param options - The configuration options for the replicated collection.
   * @param options.pull - A function to fetch data from the remote source.
   * @param options.push - An optional function to send changes and items to the remote source.
   * @param options.registerRemoteChange - An optional function to register a listener for remote changes.
   * @param options.persistence - An optional persistence adapter to combine with replication.
   * @param options.reactivity - A reactivity adapter for observing changes in the collection.
   * @param options.transform - A transformation function to apply to items when retrieving them.
   * @param options.indices - An array of index providers for optimized querying.
   * @param options.enableDebugMode - A boolean to enable or disable debug mode.
   */
  constructor(options: ReplicatedCollectionOptions<T, I, E, U>) {
    const replicationAdapter = createReplicationAdapter({
      registerRemoteChange: options.registerRemoteChange,
      pull: async () => {
        this.isPullingRemoteSignal.set(true)
        try {
          return await options.pull()
        } finally {
          this.isPullingRemoteSignal.set(false)
        }
      },
      push: options.push
        ? async (changes, items) => {
          if (!options.push) throw new Error('Pushing is not configured for this collection. Try to pass a `push` function to the collection options.')

          this.isPushingRemoteSignal.set(true)
          try {
            await options.push(changes, items)
          } finally {
            this.isPushingRemoteSignal.set(false)
          }
        }
        : undefined,
    })
    const persistenceAdapter = options?.persistence
      ? combinePersistenceAdapters(replicationAdapter, options.persistence)
      : replicationAdapter
    super({
      ...options,
      persistence: persistenceAdapter,
    })
    this.isPullingRemoteSignal = createSignal(options.reactivity, false)
    this.isPushingRemoteSignal = createSignal(options.reactivity, false)
  }

  /**
   * Checks whether the collection is currently performing any loading operation,
   * including pulling or pushing data from/to the remote source, or standard
   * persistence adapter operations.
   * ⚡️ this function is reactive!
   * @returns A boolean indicating if the collection is currently loading or synchronizing.
   */
  public isLoading() {
    const isPullingRemote = this.isPullingRemoteSignal.get()
    const isPushingRemote = this.isPushingRemoteSignal.get()
    const isLoading = super.isLoading()
    return isPullingRemote || isPushingRemote || isLoading
  }
}
