import type { BaseItem } from '@signaldb/core'
import { modify } from '@signaldb/core'
import type { Change } from './types'

/**
 * applies changes to a collection of items
 * @param items The items to apply the changes to
 * @param changes The changes to apply to the items
 * @returns The new items after applying the changes
 */
export default function applyChanges<ItemType extends BaseItem<IdType>, IdType>(
  items: ItemType[],
  changes: Change<ItemType, IdType>[],
): ItemType[] {
  // Create initial map of items by ID
  const itemMap = new Map(items.map(item => [item.id, item]))

  changes.forEach((change) => {
    if (change.type === 'remove') {
      itemMap.delete(change.data)
    } else if (change.type === 'insert') {
      const existingItem = itemMap.get(change.data.id)
      itemMap.set(
        change.data.id,
        existingItem ? { ...existingItem, ...change.data } : change.data,
      )
    } else { // change.type === 'update'
      const existingItem = itemMap.get(change.data.id)
      itemMap.set(
        change.data.id,
        existingItem
          ? modify(existingItem, change.data.modifier)
          : modify({ id: change.data.id } as ItemType, change.data.modifier),
      )
    }
  })

  // Convert map back to array
  return [...itemMap.values()]
}
