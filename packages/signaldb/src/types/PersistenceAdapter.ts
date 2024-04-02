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

// eslint-disable-next-line max-len
export default interface PersistenceAdapter<T extends { id: I } & Record<string, any>, I> {
  load(): Promise<LoadResponse<T>>,
  save(items: T[], changes: Changeset<T>): Promise<void>,
  register(onChange: () => void | Promise<void>): Promise<void>,
}
