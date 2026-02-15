export interface Changeset<T> {
  added: T[],
  modified: T[],
  removed: T[],
}

export default interface StorageAdapter<T extends { id: I } & Record<string, any>, I> {
  // lifecycle methods
  setup(): Promise<void>,
  teardown(): Promise<void>,

  // data retrieval methods
  readAll(): Promise<T[]>,
  readIds(positions: I[]): Promise<T[]>,

  // index methods
  createIndex(field: string): Promise<void>,
  dropIndex(field: string): Promise<void>,
  readIndex(field: string): Promise<Map<any, Set<I>>>,

  // data manipulation methods
  insert(items: T[]): Promise<void>,
  replace(items: T[]): Promise<void>,
  remove(items: T[]): Promise<void>,
  removeAll(): Promise<void>,
}
