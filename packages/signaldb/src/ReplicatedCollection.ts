import Collection from './Collection'
import type { BaseItem, CollectionOptions } from './Collection'
import type { Changeset, LoadResponse } from './types/PersistenceAdapter'
import combinePersistenceAdapters from './persistence/combinePersistenceAdapters'
import createPersistenceAdapter from './persistence/createPersistenceAdapter'

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
  constructor(options: ReplicatedCollectionOptions<T, I, U>) {
    const replicationAdapter = createReplicationAdapter(options)
    const persistenceAdapter = options?.persistence
      ? combinePersistenceAdapters(replicationAdapter, options.persistence)
      : replicationAdapter
    super({
      ...options,
      persistence: persistenceAdapter,
    })
  }
}
