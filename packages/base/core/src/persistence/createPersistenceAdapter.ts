import type PersistenceAdapter from '../types/PersistenceAdapter'

/**
 * Creates an PersistenceAdapter based on the given definition.
 * @param definition - The definition of the PersistenceAdapter.
 * @returns The created PersistenceAdapter.
 */
export default function createPersistenceAdapter<T extends { id: I } & Record<string, any>, I>(
  definition: PersistenceAdapter<T, I>,
): PersistenceAdapter<T, I> {
  return definition
}
