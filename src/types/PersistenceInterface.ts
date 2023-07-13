interface Changeset<T> {
  added: T[],
  modified: T[],
  removed: T[],
}

// eslint-disable-next-line max-len
export default interface PersistenceInterface<T extends { id: I } & Record<string, any>, I> {
  load(): Promise<{ items: T[], changes?: Changeset<T> }>,
  save(items: T[], changes: Changeset<T>): Promise<void>,
  register(onChange: () => void | Promise<void>): Promise<void>,
}
