import type { BaseItem } from '../Collection'
import Collection from '../Collection'
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
) {
  const collection = new Collection<ItemType, IdType>()
  items.forEach(item => collection.insert(item))
  changes.forEach((change) => {
    if (change.type === 'insert') {
      collection.insert(change.data)
    } else if (change.type === 'update') {
      collection.updateOne({ id: change.data.id } as Record<string, any>, change.data.modifier)
    } else if (change.type === 'remove') {
      collection.removeOne({ id: change.data } as Record<string, any>)
    }
  })
  return collection.find().fetch()
}
