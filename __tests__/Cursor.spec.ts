import { vi, describe, it, expect } from 'vitest'
import type { ObserveCallbacks, Transform } from '../src/index'
import { Collection } from '../src/index'

// Helper function to wait for async operations
const wait = () => new Promise((resolve) => { setImmediate(resolve) })

describe('Cursor', () => {
  interface TestItem {
    id: number,
    name: string,
    test?: boolean,
  }

  const items: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
    { id: 3, name: 'Item 3' },
  ]

  const collection = new Collection<TestItem>()
  items.forEach(item => collection.insert(item))

  const transform: Transform<TestItem, { id: number }> = item => ({ id: item.id })

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
      const col = new Collection<TestItem>()
      items.forEach(item => col.insert(item))

      const callbacks: ObserveCallbacks<TestItem> = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }

      const cursor = col.find()
      cursor.observeChanges(callbacks, true)

      // Change data
      col.insert({ id: 4, name: 'item4' }) // Add new item
      col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
      col.removeOne({ id: 2 }) // Remove item

      cursor.requery()

      await wait() // Wait for all async operations to finish

      expect(callbacks.added).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4' }))
      expect(callbacks.addedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 4, name: 'item4' }),
        null,
      )
      expect(callbacks.changed).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'item1_modified' }))
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, name: 'Item 3' }),
        expect.objectContaining({ id: 4, name: 'item4' }),
      )
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
})
