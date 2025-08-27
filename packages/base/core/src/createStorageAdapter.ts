import type StorageAdapter from './types/StorageAdapter'

/**
 * Creates an StorageAdapter based on the given definition.
 * @param definition - The definition of the StorageAdapter.
 * @returns The created StorageAdapter.
 */
export default function createStorageAdapter<T extends { id: I } & Record<string, any>, I>(
  definition: StorageAdapter<T, I>,
): StorageAdapter<T, I> {
  return definition
}
