import type { BaseItem, Selector } from '@signaldb/core'
import { Collection, modify } from '@signaldb/core'
import type { Change } from './types'

/**
 * applies changes to a collection of items
 * @param items The items to apply the changes to
 * @param changes The changes to apply to the items
 * @returns The new items after applying the changes
 */
export default async function applyChanges<ItemType extends BaseItem<IdType>, IdType>(
  items: ItemType[],
  changes: Change<ItemType, IdType>[],
) {
  const collection = new Collection<ItemType, IdType>()
  collection.batch(() => {
    items.forEach(item => collection.insert(item))
    changes.forEach((change) => {
      if (change.type === 'remove') {
        collection.removeOne({ id: change.data } as Selector<ItemType>)
        return
      }

      const selector = { id: change.data.id } as ItemType
      const itemExists = collection.findOne(selector)

      if (change.type === 'insert') {
        if (itemExists) { // update item if it alread exists
          collection.updateOne(selector, { $set: change.data })
        } else { // insert item if it does not exist
          collection.insert(change.data)
        }
        return
      }

      // change.type === 'update'
      if (itemExists) { // update item if it exists
        collection.updateOne(selector, change.data.modifier)
      } else { // insert item if it does not exist
        collection.insert(modify(selector, change.data.modifier))
      }
    })
  })
  const result = collection.find().fetch()
  await collection.dispose()
  return result
}
