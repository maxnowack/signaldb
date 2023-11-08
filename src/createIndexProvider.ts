import type { BaseItem } from './Collection'
import type IndexProvider from './types/IndexProvider'

export default function createIndexProvider<T extends BaseItem<I> = BaseItem, I = any>(
  definition: IndexProvider<T, I>,
) {
  return definition
}
