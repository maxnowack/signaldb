import type { BaseItem } from '../Collection'
import Collection from '../Collection'
import modify from '../utils/modify'
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
      const itemExists = collection.findOne({ id: change.data.id } as Record<string, any>)
      if (itemExists) {
        collection.updateOne({ id: change.data.id } as Record<string, any>, { $set: change.data })
      } else {
        collection.insert(change.data)
      }
    } else if (change.type === 'update') {
      const itemExists = collection.findOne({ id: change.data.id } as Record<string, any>)
      if (itemExists) {
        collection.updateOne({ id: change.data.id } as Record<string, any>, change.data.modifier)
      } else {
        collection.insert(modify({ id: change.data.id } as ItemType, change.data.modifier))
      }
    } else if (change.type === 'remove') {
      collection.removeOne({ id: change.data } as Record<string, any>)
    }
  })
  return collection.find().fetch()
}
