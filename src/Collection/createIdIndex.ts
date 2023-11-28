import createIndex from './createIndex'
import type { BaseItem } from './types'

export default function createIdIndex<T extends BaseItem<I> = BaseItem, I = any>() {
  return createIndex<T, I>('id')
}
