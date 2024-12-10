import { updateObject } from 'mingo/updater'
import type Modifier from '../types/Modifier'

export default function modify<T extends Record<string, any>>(
  item: T,
  modifier: Modifier,
) {
  const clonedItem = { ...item }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  updateObject(clonedItem, modifier as any)
  return clonedItem
}
