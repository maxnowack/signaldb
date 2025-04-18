import { vi, describe, it, expect } from 'vitest'
import type { ObserveCallbacks, Transform } from '../src'
import { Collection, createReactivityAdapter } from '../src'

// Helper function to wait for async operations
const wait = () => new Promise((resolve) => {
  setImmediate(resolve)
})

interface TestItem {
  id: number,
  name: string,
  test?: boolean,
}

const transform: Transform<TestItem, { id: number }> = item => ({ id: item.id })

describe('Cursor', () => {
  const items: TestItem[] = [
    { id: 1, name: 'Item 1', test: true },
    { id: 2, name: 'Item 2', test: false },
    { id: 3, name: 'Item 3', test: true },
  ]

  const collection = new Collection<TestItem>()
  items.forEach(item => collection.insert(item))

  describe('fetch', () => {
    it('should return transformed items when transform function is provided', () => {
      const col = new Collection({ transform })
      items.forEach(item => col.insert(item))
      const cursor = col.find({})
      const result = cursor.fetch()
      const expected = items.map(item => ({ id: item.id }))
      expect(result).toEqual(expected)
    })

    it('should return all items when no selector or options are provided', () => {
      const cursor = collection.find()
      const result = cursor.fetch()
      expect(result).toEqual(items)
    })

    it('should return filtered items when selector is provided', () => {
      const cursor = collection.find({ id: 2 })
      const result = cursor.fetch()
      expect(result).toEqual([items[1]])
    })

    it('should return sorted items when sort option is provided', () => {
      const cursor = collection.find({}, { sort: { id: -1 } })
      const result = cursor.fetch()
      const expected = [...items].reverse()
      expect(result).toEqual(expected)
    })

    it('should return limited items when limit option is provided', () => {
      const cursor = collection.find({}, { limit: 2 })
      const result = cursor.fetch()
      const expected = items.slice(0, 2)
      expect(result).toEqual(expected)
    })

    it('should return skipped items when skip option is provided', () => {
      const cursor = collection.find({}, { skip: 1 })
      const result = cursor.fetch()
      const expected = items.slice(1)
      expect(result).toEqual(expected)
    })

    it('should return projected items when fields option is provided', () => {
      expect(collection.find({}, { fields: { id: 1 } }).fetch()).toEqual([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ])
      expect(collection.find({}, { fields: { name: 1 } }).fetch()).toEqual([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ])
      expect(collection.find({}, { fields: { name: 0 } }).fetch()).toEqual([
        { id: 1, test: true },
        { id: 2, test: false },
        { id: 3, test: true },
      ])
    })

    it('should include the id when when fields option is provided', () => {
      expect(collection.find({}, { fields: { name: 1 } }).fetch()).toEqual([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ])
      expect(collection.find({}, { fields: { id: 0 } }).fetch()).toEqual([
        { name: 'Item 1', test: true },
        { name: 'Item 2', test: false },
        { name: 'Item 3', test: true },
      ])
    })

    it('should return projected, sorted, limited, and skipped items when options are provided', () => {
      const cursor = collection.find({
        id: { $gt: 1 },
      }, {
        sort: { id: 1 },
        limit: 1,
        skip: 1,
        fields: { id: 1 },
      })
      const result = cursor.fetch()
      const expected = [{ id: 3 }]
      expect(result).toEqual(expected)
    })
  })

  describe('count', () => {
    it('should return the total count of items when no selector is provided', () => {
      const cursor = collection.find()
      const result = cursor.count()
      expect(result).toEqual(items.length)
    })

    it('should return the count of filtered items when selector is provided', () => {
      const cursor = collection.find({ id: 2 })
      const result = cursor.count()
      expect(result).toBe(1)
    })

    it('should return the count of transformed items when transform function is provided', () => {
      const col = new Collection({ transform })
      items.forEach(item => col.insert(item))
      const cursor = col.find({ id: 2 })
      const result = cursor.count()
      expect(result).toBe(1)
    })

    it('should return the count of sorted, limited, and skipped items when options are provided', () => {
      const cursor = collection.find({ id: { $gt: 1 } }, { sort: { id: 1 }, limit: 1, skip: 1 })
      const result = cursor.count()
      expect(result).toBe(1)
    })
  })

  describe('observeChanges', () => {
    it('should call the added callback when items are added', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      col.insert({ id: 4, name: 'item4' }) // Add new item
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4' }))
      expect(callbacks.addedBefore).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4' }), null)
      expect(callbacks.changed).not.toHaveBeenCalled()
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).not.toHaveBeenCalled()
    })

    it('should call the changed callback when items are changed', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).not.toHaveBeenCalled()
      expect(callbacks.addedBefore).not.toHaveBeenCalled()
      expect(callbacks.changed).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'item1_modified' }))
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).not.toHaveBeenCalled()
    })

    it('should call the removed callback when items are removed', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      col.removeOne({ id: 2 }) // Remove item
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).not.toHaveBeenCalled()
      expect(callbacks.addedBefore).not.toHaveBeenCalled()
      expect(callbacks.changed).not.toHaveBeenCalled()
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Item 2' }))
    })

    it('should call the removed callback when items are removed from query', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find({ test: { $ne: true } })
      cursor.observeChanges(callbacks, true)
      col.updateOne({ id: 2 }, { $set: { test: true } })
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).not.toHaveBeenCalled()
      expect(callbacks.addedBefore).not.toHaveBeenCalled()
      expect(callbacks.changed).not.toHaveBeenCalled()
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Item 2' }))
    })

    it('should call the addedBefore callback when items are added', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find({}, {
        sort: { id: -1 },
      })
      cursor.observeChanges(callbacks, true)
      col.insert({ id: 4, name: 'item4' }) // Add new item
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4' }))
      expect(callbacks.addedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 4, name: 'item4' }),
        expect.objectContaining({ id: 3, name: 'Item 3' }),
      )
      expect(callbacks.changed).not.toHaveBeenCalled()
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).not.toHaveBeenCalled()
    })

    it('should call the movedBefore callback when items are moved', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find({}, {
        sort: { name: 1 },
      })
      cursor.observeChanges(callbacks, true)
      col.updateOne({ id: 2 }, { $set: { name: 'Item 30' } })
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).not.toHaveBeenCalled()
      expect(callbacks.addedBefore).not.toHaveBeenCalled()
      expect(callbacks.changed).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Item 30' }))
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, name: 'Item 30' }),
        null,
      )
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, name: 'Item 3' }),
        expect.objectContaining({ id: 2, name: 'Item 30' }),
      )
      expect(callbacks.removed).not.toHaveBeenCalled()
    })

    it('should not call the changed callback when hidden fields are changed', async () => {
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find({}, { fields: { id: 1 } })
      cursor.observeChanges(callbacks, true)
      col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).not.toHaveBeenCalled()
      expect(callbacks.addedBefore).not.toHaveBeenCalled()
      expect(callbacks.changed).not.toHaveBeenCalled()
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).not.toHaveBeenCalled()
    })

    it('should call the appropriate callbacks when items are added, moved, changed, or removed', async () => {
      const col = new Collection<TestItem & { count: number }>()
      items.forEach((item, index) => col.insert({ ...item, count: index }))

      const callbacks: ObserveCallbacks<TestItem> = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }

      const cursor = col.find({}, {
        sort: { count: 1 },
      })
      cursor.observeChanges(callbacks, true)

      // Change data
      col.insert({ id: 4, name: 'item4', count: 99 }) // Add new item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.added).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4' }))
      expect(callbacks.addedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 4, name: 'item4' }),
        null,
      )

      col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.changed).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'item1_modified' }))

      col.updateOne({ id: 1 }, { $set: { count: 42 } }) // Move existing item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 4 }),
      )

      col.updateOne({ id: 2 }, { $set: { count: 999 } }) // Move existing item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2 }),
        null,
      )

      col.removeOne({ id: 2 }) // Remove item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.removed).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Item 2' }))
    })

    it('should call the callbacks and work properly with transformations', async () => {
      const col = new Collection<TestItem>({
        transform: item => ({ ...item, id: item.id, test: true }),
      })
      items.forEach(item => col.insert(item))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      col.insert({ id: 4, name: 'item4' }) // Add new item
      cursor.requery()

      await wait() // Wait for all operations to finish
      expect(callbacks.added).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4', test: true }))
      expect(callbacks.addedBefore).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4', test: true }), null)
      expect(callbacks.changed).not.toHaveBeenCalled()
      expect(callbacks.movedBefore).not.toHaveBeenCalled()
      expect(callbacks.removed).not.toHaveBeenCalled()
    })
  })

  describe('reactivity', () => {
    it('should call the functions in the provided reactivity adapter', async () => {
      const depCreation = vi.fn()
      const dep = vi.fn()
      const notify = vi.fn()
      const scopeCheck = vi.fn()
      let disposal = vi.fn()

      const reactivity = createReactivityAdapter({
        create() {
          depCreation()
          return {
            depend() {
              dep()
            },
            notify() {
              notify()
            },
          }
        },
        isInScope() {
          scopeCheck()
          return true
        },
        onDispose(callback) {
          disposal = vi.fn(callback)
        },
      })
      const cursor = collection.find({}, { reactive: reactivity })
      const result = cursor.fetch()
      expect(result).toEqual(items)

      expect(depCreation).toHaveBeenCalled()
      expect(dep).toHaveBeenCalled()
      expect(scopeCheck).toHaveBeenCalled()
      expect(disposal).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()

      collection.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } })
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })

      expect(notify).toHaveBeenCalled()
      disposal()
      expect(disposal).toHaveBeenCalled()
      collection.updateOne({ id: 1 }, { $set: { name: 'item1_' } })
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })
      expect(notify).toHaveBeenCalledTimes(1)
      cursor.cleanup()
    })

    it('should requery only once after batch operation', () => {
      const depCreation = vi.fn()
      const dep = vi.fn()
      const notify = vi.fn()
      const scopeCheck = vi.fn()

      const reactivity = createReactivityAdapter({
        create() {
          depCreation()
          return {
            depend() {
              dep()
            },
            notify() {
              notify()
            },
          }
        },
        isInScope() {
          scopeCheck()
          return true
        },
      })
      const collection2 = new Collection<{ id: string, name: string }>({
        reactivity,
      })
      const cursor = collection2.find({})
      const result = cursor.fetch()
      expect(result).toHaveLength(0)

      collection2.batch(() => {
        // create items
        for (let i = 0; i < 10_000; i += 1) {
          collection2.insert({ id: i.toString(), name: `John ${i}` })
          expect(notify).toHaveBeenCalledTimes(0)
        }
      })
      expect(notify).toHaveBeenCalled()
    })
  })
})
