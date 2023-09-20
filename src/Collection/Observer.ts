import isEqual from '../utils/isEqual'

export interface ObserveCallbacks<T> {
  added?: (item: T) => void,
  addedBefore?: (item: T, before: T) => void,
  changed?: (item: T) => void,
  movedBefore?: (item: T, before: T) => void,
  removed?: (item: T) => void,
}

export default class Observer<T extends { id: any }> {
  private previousItems: T[] = []
  private callbacks: ObserveCallbacks<T>
  private skipInitial = false
  private isIinitial = true
  private unbindEvents: () => void

  constructor(
    callbacks: ObserveCallbacks<T>,
    bindEvents: () => () => void,
    skipInitial = false,
  ) {
    this.callbacks = callbacks
    this.skipInitial = skipInitial
    this.unbindEvents = bindEvents()
  }

  // eslint-disable-next-line max-len
  private call<K extends keyof ObserveCallbacks<T>>(event: K, ...args: Parameters<NonNullable<ObserveCallbacks<T>[K]>>) {
    const callback = this.callbacks[event] as any
    if (!callback) return
    if (this.skipInitial && this.isIinitial) return
    callback(...args)
  }

  private hasCallbacks(events: (keyof ObserveCallbacks<T>)[]) {
    return events.some(event => !!this.callbacks[event])
  }

  public check(newItems: T[]) {
    const oldItemsMap = new Map(this.previousItems.map((item, index) => [
      item.id,
      { item, index, beforeItem: this.previousItems[index + 1] || null },
    ]))
    const newItemsMap = new Map(newItems.map((item, index) => [
      item.id,
      { item, index, beforeItem: newItems[index + 1] || null },
    ]))

    if (this.hasCallbacks(['changed', 'movedBefore', 'removed'])) {
      // Check for removed or changed items
      oldItemsMap.forEach(({ item: oldItem, index, beforeItem: oldBeforeItem }) => {
        const newItem = newItemsMap.get(oldItem.id)
        if (newItem) {
          // If the item exists but has changed, call 'changed' callback
          if (!isEqual(newItem.item, oldItem)) {
            this.call('changed', newItem.item)
          }
          // If the item's beforeItem has changed, call 'movedBefore' callback
          if (newItem.index !== index && newItem.beforeItem?.id !== oldBeforeItem?.id) {
            this.call('movedBefore', newItem.item, newItem.beforeItem)
          }
        } else {
          // If the item no longer exists, call 'removed' callback
          this.call('removed', oldItem)
        }
      })
    }

    if (this.hasCallbacks(['added', 'addedBefore'])) {
      // Check for added items
      newItems.forEach((newItem, index) => {
        const oldItem = oldItemsMap.get(newItem.id)
        if (oldItem) return

        // If the item is newly added, call 'added' and 'addedBefore' callbacks
        this.call('added', newItem)
        this.call('addedBefore', newItem, newItems[index + 1] || null)
      })
    }

    // Store new items as previous items for next check
    this.previousItems = newItems
    this.isIinitial = false
  }

  public stop() {
    this.unbindEvents()
  }
}
