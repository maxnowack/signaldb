import type { BaseItem } from './Collection'
import type IndexProvider from './types/IndexProvider'

/**
 * Creates an IndexProvider based on the given definition.
 * @param definition - The definition of the IndexProvider.
 * @returns The created IndexProvider.
 */
export default function createIndexProvider<T extends BaseItem<I> = BaseItem, I = any>(
  definition: IndexProvider<T, I>,
) {
  return definition
}
