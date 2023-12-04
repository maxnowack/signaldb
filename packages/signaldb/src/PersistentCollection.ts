import type { BaseItem, CollectionOptions } from './Collection'
import Collection from './Collection'
import createLocalStorageAdapter from './persistence/createLocalStorageAdapter'
import createFilesystemAdapter from './persistence/createFilesystemAdapter'

function createAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(name: string) {
  if (typeof window === 'undefined') { // server side
    return createFilesystemAdapter<T, I>(`persistent-collection-${name}.json`)
  }
  return createLocalStorageAdapter<T, I>(name)
}

// eslint-disable-next-line max-len
export default class PersistentCollection<T extends BaseItem<I> = BaseItem, I = any, U = T> extends Collection<T, I, U> {
  constructor(name: string, options?: CollectionOptions<T, I, U>) {
    super({
      persistence: createAdapter<T, I>(name),
      ...options,
    })
  }
}
