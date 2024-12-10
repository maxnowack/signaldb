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
    onChange: (data?: LoadResponse<T>) => void | Promise<void>
  ) => Promise<void>,
}
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
  U = T,
> = CollectionOptions<T, I, U> & ReplicationOptions<T, I>

export default class ReplicatedCollection<
  T extends BaseItem<I> = BaseItem,
  I = any,
  U = T,
> extends Collection<T, I, U> {
  private isPullingRemoteSignal: Signal<boolean>
  private isPushingRemoteSignal: Signal<boolean>

  constructor(options: ReplicatedCollectionOptions<T, I, U>) {
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
      push: options.push ? (async (changes, items) => {
        if (!options.push) throw new Error('Pushing is not configured for this collection. Try to pass a `push` function to the collection options.')

        this.isPushingRemoteSignal.set(true)
        try {
          await options.push(changes, items)
        } finally {
          this.isPushingRemoteSignal.set(false)
        }
      }) : undefined,
    })
    const persistenceAdapter = options?.persistence
      ? combinePersistenceAdapters(replicationAdapter, options.persistence)
      : replicationAdapter
    super({
      ...options,
      persistence: persistenceAdapter,
    })
    this.isPullingRemoteSignal = createSignal(options.reactivity?.create(), false)
    this.isPushingRemoteSignal = createSignal(options.reactivity?.create(), false)
  }

  public isLoading() {
    const isPullingRemote = this.isPullingRemoteSignal.get()
    const isPushingRemote = this.isPushingRemoteSignal.get()
    const isLoading = super.isLoading()
    return isPullingRemote || isPushingRemote || isLoading
  }
}
