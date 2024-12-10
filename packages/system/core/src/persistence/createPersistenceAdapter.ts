import type PersistenceAdapter from '../types/PersistenceAdapter'

export default function createPersistenceAdapter<T extends { id: I } & Record<string, any>, I>(
  definition: PersistenceAdapter<T, I>,
): PersistenceAdapter<T, I> {
  return definition
}
