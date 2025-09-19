import { vi, describe, it, expect } from 'vitest'
import type { ObserveCallbacks, Transform } from '../src'
import { Collection, createReactivityAdapter } from '../src'

// Helper function to wait for async operations
const wait = () => new Promise((resolve) => {
  setImmediate(resolve)
})

// Coverage extras for async branches
describe('Cursor (async) coverage', () => {
  it('covers forEach/map/count async branches', async () => {
    const col = new Collection<{ id: string, name: string }>()
    await col.insert({ id: '1', name: 'a' })
    await col.insert({ id: '2', name: 'b' })

    const cursor = col.find<true>({}, { async: true })
    const fetched = await cursor.fetch()
    expect(fetched.length).toBe(2)
    const mapped = await cursor.map(i => i.name)
    expect(mapped.toSorted()).toEqual(['a', 'b'])
    const counted = await cursor.count()
    expect(counted).toBe(2)
    await cursor.forEach(() => {})
  })
})

interface TestItem {
  id: number,
  name: string,
  test?: boolean,
}

const transform: Transform<TestItem, { id: number }> = item => ({ id: item.id })

describe('Cursor', async () => {
  const items: TestItem[] = [
    { id: 1, name: 'Item 1', test: true },
    { id: 2, name: 'Item 2', test: false },
    { id: 3, name: 'Item 3', test: true },
  ]

  const collection = new Collection<TestItem>()
  await Promise.all(items.map(item => collection.insert(item)))

  describe('fetch', () => {
    it('should return transformed items when transform function is provided', async () => {
      const col = new Collection({ transform })
      await Promise.all(items.map(item => col.insert(item)))
      const cursor = col.find<true>({}, { async: true })
      const result = await cursor.fetch()
      const expected = items.map(item => ({ id: item.id }))
      expect(result).toEqual(expected)
    })

    it('should return all items when no selector or options are provided', async () => {
      const cursor = collection.find<true>({}, { async: true })
      const result = await cursor.fetch()
      expect(result).toEqual(items)
    })

    it('should return filtered items when selector is provided', async () => {
      const cursor = collection.find<true>({ id: 2 }, { async: true })
      const result = await cursor.fetch()
      expect(result).toEqual([items[1]])
    })

    it('should return sorted items when sort option is provided', async () => {
      const cursor = collection.find<true>({}, { sort: { id: -1 }, async: true })
      const result = await cursor.fetch()
      const expected = [...items].toReversed()
      expect(result).toEqual(expected)
    })

    it('should return limited items when limit option is provided', async () => {
      const cursor = collection.find<true>({}, { limit: 2, async: true })
      const result = await cursor.fetch()
      const expected = items.slice(0, 2)
      expect(result).toEqual(expected)
    })

    it('should return skipped items when skip option is provided', async () => {
      const cursor = collection.find<true>({}, { skip: 1, async: true })
      const result = await cursor.fetch()
      const expected = items.slice(1)
      expect(result).toEqual(expected)
    })

    it('should return projected items when fields option is provided', async () => {
      await expect(collection.find<true>({}, { fields: { id: 1 }, async: true }).fetch()).resolves.toEqual([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ])
      await expect(collection.find<true>({}, { fields: { name: 1 }, async: true }).fetch()).resolves.toEqual([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ])
      await expect(collection.find<true>({}, { fields: { name: 0 }, async: true }).fetch()).resolves.toEqual([
        { id: 1, test: true },
        { id: 2, test: false },
        { id: 3, test: true },
      ])
    })

    it('should include the id when when fields option is provided', async () => {
      await expect(collection.find<true>({}, { fields: { name: 1 }, async: true }).fetch()).resolves.toEqual([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ])
      await expect(collection.find<true>({}, { fields: { id: 0 }, async: true }).fetch()).resolves.toEqual([
        { name: 'Item 1', test: true },
        { name: 'Item 2', test: false },
        { name: 'Item 3', test: true },
      ])
    })

    it('should return projected, sorted, limited, and skipped items when options are provided', async () => {
      const cursor = collection.find<true>({
        id: { $gt: 1 },
      }, {
        sort: { id: 1 },
        limit: 1,
        skip: 1,
        fields: { id: 1 },
        async: true,
      })
      const result = await cursor.fetch()
      const expected = [{ id: 3 }]
      expect(result).toEqual(expected)
    })
  })

  describe('count', () => {
    it('should return the total count of items when no selector is provided', async () => {
      const cursor = collection.find<true>({}, { async: true })
      const result = await cursor.count()
      expect(result).toEqual(items.length)
    })

    it('should return the count of filtered items when selector is provided', async () => {
      const cursor = collection.find<true>({ id: 2 }, { async: true })
      const result = await cursor.count()
      expect(result).toBe(1)
    })

    it('should return the count of transformed items when transform function is provided', async () => {
      const col = new Collection({ transform })
      await Promise.all(items.map(item => col.insert(item)))
      const cursor = col.find<true>({ id: 2 }, { async: true })
      const result = await cursor.count()
      expect(result).toBe(1)
    })

    it('should return the count of sorted, limited, and skipped items when options are provided', async () => {
      const cursor = collection.find<true>({ id: { $gt: 1 } }, { sort: { id: 1 }, limit: 1, skip: 1, async: true })
      const result = await cursor.count()
      expect(result).toBe(1)
    })
  })

  describe('observeChanges', () => {
    it('should call the added callback when items are added', async () => {
      const col = new Collection<TestItem>()
      await Promise.all(items.map(item => col.insert(item)))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      await col.insert({ id: 4, name: 'item4' }) // Add new item
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
      await Promise.all(items.map(item => col.insert(item)))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      await col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
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
      await Promise.all(items.map(item => col.insert(item)))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      await col.removeOne({ id: 2 }) // Remove item
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
      await Promise.all(items.map(item => col.insert(item)))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find({ test: { $ne: true } })
      cursor.observeChanges(callbacks, true)
      await col.updateOne({ id: 2 }, { $set: { test: true } })
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
      await Promise.all(items.map(item => col.insert(item)))

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
      await col.insert({ id: 4, name: 'item4' }) // Add new item
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
      await Promise.all(items.map(item => col.insert(item)))

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
      await col.updateOne({ id: 2 }, { $set: { name: 'Item 30' } })
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
      await Promise.all(items.map(item => col.insert(item)))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find({}, { fields: { id: 1 } })
      cursor.observeChanges(callbacks, true)
      await col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
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
      await Promise.all(items.map((item, index) => col.insert({ ...item, count: index })))

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
      await col.insert({ id: 4, name: 'item4', count: 99 }) // Add new item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.added).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'item4' }))
      expect(callbacks.addedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 4, name: 'item4' }),
        null,
      )

      await col.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } }) // Modify existing item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.changed).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'item1_modified' }))

      await col.updateOne({ id: 1 }, { $set: { count: 42 } }) // Move existing item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 4 }),
      )

      await col.updateOne({ id: 2 }, { $set: { count: 999 } }) // Move existing item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.movedBefore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2 }),
        null,
      )

      await col.removeOne({ id: 2 }) // Remove item
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(callbacks.removed).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Item 2' }))
    })

    it('should call the callbacks and work properly with transformations', async () => {
      const col = new Collection<TestItem>({
        transform: item => ({ ...item, id: item.id, test: true }),
      })
      await Promise.all(items.map(item => col.insert(item)))

      const callbacks = {
        added: vi.fn(),
        addedBefore: vi.fn(),
        changed: vi.fn(),
        movedBefore: vi.fn(),
        removed: vi.fn(),
      }
      const cursor = col.find()
      cursor.observeChanges(callbacks, true)
      await col.insert({ id: 4, name: 'item4' }) // Add new item
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

      await collection.updateOne({ id: 1 }, { $set: { name: 'item1_modified' } })
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })

      expect(notify).toHaveBeenCalled()
      disposal()
      expect(disposal).toHaveBeenCalled()
      await collection.updateOne({ id: 1 }, { $set: { name: 'item1_' } })
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })
      expect(notify).toHaveBeenCalledTimes(1)
      cursor.cleanup()
    })

    it('should requery only once after batch operation', async () => {
      const notify = vi.fn()

      const collection2 = new Collection<{ id: string, name: string }>()
      const cursor = collection2.find<true>({}, { async: true })
      const result = await cursor.fetch()
      expect(result).toHaveLength(0)
      expect(notify).toHaveBeenCalledTimes(0)

      const stopObserving = cursor.observeChanges({
        added: () => notify(),
        changed: () => notify(),
        removed: () => notify(),
      }, true)

      await collection2.batch(async () => {
        for (let i = 0; i < 100; i += 1) {
          await collection2.insert({ id: i.toString(), name: `John ${i}` })
          expect(notify).toHaveBeenCalledTimes(0)
        }
      })
      await wait()
      expect(notify).toHaveBeenCalled()
      stopObserving()
    })
  })
})
