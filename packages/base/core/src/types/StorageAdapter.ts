export interface Changeset<T> {
  added: T[],
  modified: T[],
  removed: T[],
}

export type LoadResponse<T> = {
  items: T[],
  changes?: never,
} | {
  changes: Changeset<T>,
  items?: never,
}

export default interface StorageAdapter<T extends { id: I } & Record<string, any>, I> {
  load(): Promise<LoadResponse<T>>,
  save(items: T[], changes: Changeset<T>): Promise<void>,
  register(onChange: (data?: LoadResponse<T>) => void | Promise<void>): Promise<void>,
  unregister?(): Promise<void>,
}
