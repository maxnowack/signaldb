import { useSyncExternalStore } from 'react'

export type StoreItem<T extends Record<string, any>> = T & {
  id: string,
  patch: (patch: Partial<Omit<StoreItem<T>, 'id'>>, emitChange?: boolean) => void,
}

export default class ItemStore<T extends Record<string, any>> {
  private eventTarget = new EventTarget()
  private items: StoreItem<T>[] = []

  register(id: string, data: T) {
    const foundItem = this.items.find(t => t.id === id)
    if (foundItem) return foundItem
    const item: StoreItem<T> = {
      ...data,
      id,
      patch: (patch, emitChange = true) => {
        const newItems = this.items.map(t =>
          t.id === id ? { ...t, ...patch } : t,
        )
        this.items = newItems
        if (emitChange) this.emitChanges(id)
      },
    }
    this.items.push(item)
    this.emitChanges(id)
    return item
  }

  emitChanges(id: string) {
    setTimeout(() => {
      this.eventTarget.dispatchEvent(new CustomEvent('change', { detail: id }))
      this.eventTarget.dispatchEvent(new CustomEvent(`change-${id}`, { detail: id }))
    }, 10)
  }

  unregister(id: string) {
    this.items = this.items.filter(t => t.id !== id)
    this.emitChanges(id)
  }

  unregisterAll() {
    const ids = this.items.map(t => t.id)
    this.items = []
    ids.forEach(id => this.emitChanges(id))
  }

  subscribe(onChange: (id: string) => void) {
    const handler = (event: Event) => {
      onChange((event as CustomEvent<string>).detail)
    }
    this.eventTarget.addEventListener('change', handler)
    return () => this.eventTarget.removeEventListener('change', handler)
  }

  getItems() {
    return this.items
  }

  getItem(id: string) {
    return this.items.find(t => t.id === id)
  }

  subscribeItem(id: string, onChange: () => void) {
    this.eventTarget.addEventListener(`change-${id}`, onChange)
    return () => this.eventTarget.removeEventListener(`change-${id}`, onChange)
  }

  clear() {
    const ids = this.items.map(t => t.id)
    this.items = []
    ids.forEach(id => this.emitChange(id))
  }

  emitChange(id?: string) {
    setTimeout(() => {
      if (id) {
        this.eventTarget.dispatchEvent(new CustomEvent(`change-${id}`, { detail: id }))
      } else {
        this.eventTarget.dispatchEvent(new Event('change'))
      }
    }, 10)
  }

  useItems() {
    return useSyncExternalStore(this.subscribe.bind(this), this.getItems.bind(this))
  }

  useItem(id: string) {
    return useSyncExternalStore(
      this.subscribeItem.bind(this, id),
      this.getItem.bind(this, id),
    )
  }
}
