import type { BaseItem } from '@signaldb/core'
import { isEqual } from '@signaldb/core'

/**
 * Computes the modified fields between two items recursively.
 * @param oldItem The old item
 * @param newItem The new item
 * @returns The modified fields
 */
export function computeModifiedFields<T extends Record<string, any>>(
  oldItem: T,
  newItem: T,
): string[] {
  const modifiedFields: string[] = []

  const oldKeys = Object.keys(oldItem)
  const newKeys = Object.keys(newItem)
  const allKeys = new Set([...oldKeys, ...newKeys])

  for (const key of allKeys) {
    if (newItem[key] !== oldItem[key]) {
      if (typeof newItem[key] === 'object' && typeof oldItem[key] === 'object' && newItem[key] != null && oldItem[key] != null) {
        const nestedModifiedFields = computeModifiedFields(oldItem[key], newItem[key])
        for (const nestedField of nestedModifiedFields) {
          modifiedFields.push(`${key}.${nestedField}`)
        }
      } else {
        modifiedFields.push(key)
      }
    }
  }

  return modifiedFields
}

/**
 * Compute changes between two arrays of items.
 * @param oldItems Array of the old items
 * @param newItems Array of the new items
 * @returns The changeset
 */
export default function computeChanges<ItemType extends BaseItem<IdType>, IdType>(
  oldItems: ItemType[],
  newItems: ItemType[],
) {
  const added: ItemType[] = []
  const modified: ItemType[] = []
  const modifiedFields: Map<IdType, string[]> = new Map()
  const removed: ItemType[] = []

  const oldItemsMap = new Map(oldItems.map(item => [item.id, item]))
  const newItemsMap = new Map(newItems.map(item => [item.id, item]))

  for (const [id, oldItem] of oldItemsMap) {
    const newItem = newItemsMap.get(id)
    if (!newItem) {
      removed.push(oldItem)
    } else if (!isEqual(newItem, oldItem)) {
      modifiedFields.set(newItem.id, computeModifiedFields(oldItem, newItem))
      modified.push(newItem)
    }
  }

  for (const [id, newItem] of newItemsMap) {
    if (!oldItemsMap.has(id)) {
      added.push(newItem)
    }
  }

  return {
    added,
    modified,
    modifiedFields,
    removed,
  }
}
