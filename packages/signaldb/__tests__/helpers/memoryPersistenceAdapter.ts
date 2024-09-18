import type { PersistenceAdapter } from '../../src'

export default function memoryPersistenceAdapter<
  T extends { id: I } & Record<string, any>,
  I = any,
>(
  initialData: T[] = [],
  transmitChanges = false,
) {
  // not really a "persistence adapter", but it works for testing
  let items = [...initialData]
  const changes: {
    added: T[],
    modified: T[],
    removed: T[],
  } = {
    added: [],
    modified: [],
    removed: [],
  }
  let onChange: () => void | Promise<void> = () => { /* do nothing */ }
  return {
    register: (changeCallback: () => void | Promise<void>) => {
      onChange = changeCallback
      return Promise.resolve()
    },
    load: () => {
      const currentChanges = { ...changes }
      changes.added = []
      changes.modified = []
      changes.removed = []
      const hasChanges = currentChanges.added.length > 0
        || currentChanges.modified.length > 0
        || currentChanges.removed.length > 0
      if (transmitChanges && hasChanges) {
        return Promise.resolve({ changes: currentChanges })
      }
      return Promise.resolve({ items })
    },
    save: (newSnapshot: T[]) => {
      items = [...newSnapshot]
      return Promise.resolve()
    },
    addNewItem: (item: T) => {
      items.push(item)
      changes.added.push(item)
      void onChange()
    },
    changeItem: (item: T) => {
      items = items.map(i => (i.id === item.id ? item : i))
      changes.modified.push(item)
      void onChange()
    },
    removeItem: (item: T) => {
      items = items.filter(i => i.id !== item.id)
      changes.removed.push(item)
      void onChange()
    },
  } as (PersistenceAdapter<T, I> & {
    addNewItem: (item: T) => void,
    changeItem: (item: T) => void,
    removeItem: (item: T) => void,
  })
}
