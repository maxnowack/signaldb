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
  /**
   * The index, keyed by `serializeValue(value)` — not by the raw field value.
   *
   * SignalDB looks an index up with the serialized form, because that is what
   * makes `3`, `'3'` and `new Date(...)` comparable as map keys at all. An
   * adapter that stores its backend's own keys instead answers nothing for
   * every non-string field, and everything for a `$ne` on one.
   */
  readIndex(field: string): Promise<Map<string | null, Set<I>>>,

  // data manipulation methods
  insert(items: T[]): Promise<void>,
  replace(items: T[]): Promise<void>,
  remove(items: T[]): Promise<void>,
  removeAll(): Promise<void>,
}
