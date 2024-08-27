import { vi, beforeEach, describe, it, expect } from 'vitest'
import { Collection, createMemoryAdapter, createIndex } from '../src'

describe('Collection', () => {
  let collection: Collection<{ id: string, name: string }>

  beforeEach(() => {
    collection = new Collection<{ id: string, name: string }>({
      memory: createMemoryAdapter([]),
    })
  })

  describe('findOne', () => {
    it('should find and return an item that matches the selector', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })

      const item = collection.findOne({ name: 'John' })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should return undefined if no item matches the selector', () => {
      collection.insert({ id: '1', name: 'John' })

      const item = collection.findOne({ name: 'Jane' })

      expect(item).toBeUndefined()
    })

    it('should return the first matching item if multiple items match the selector', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'John' })

      const item = collection.findOne({ name: 'John' })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should emit "findOne" event', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })

      const eventHandler = vi.fn()
      collection.on('findOne', eventHandler)

      collection.findOne({ name: 'John' }, { fields: { id: 1 } })

      expect(eventHandler).toHaveBeenCalledWith({ name: 'John' }, { fields: { id: 1 } }, { id: '1' })
    })
  })

  describe('find', () => {
    it('should find and return items that match the selector', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })

      const items = collection.find({ name: 'John' }).fetch()

      expect(items).toEqual([
        { id: '1', name: 'John' },
        { id: '3', name: 'John' },
      ])
    })

    it('should return an empty array if no items match the selector', () => {
      collection.insert({ id: '1', name: 'John' })

      const items = collection.find({ name: 'Jane' }).fetch()

      expect(items).toEqual([])
    })

    it('should emit "find" event', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })

      const eventHandler = vi.fn().mockImplementation((selector, options, cursor) => {
        expect(selector).toEqual({ name: 'John' })
        expect(options).toEqual({ fields: { id: 1 } })
        expect(cursor.fetch()).toEqual([{ id: '1' }])
      })

      collection.on('find', eventHandler)

      collection.find({ name: 'John' }, { fields: { id: 1 } })

      expect(eventHandler).toHaveBeenCalled()
    })
  })

  describe('insert', () => {
    it('should insert an item into the collection', () => {
      const item = { id: '1', name: 'John' }

      collection.insert(item)

      expect(collection.findOne({ id: '1' })).toEqual(item)
    })

    it('should emit "added" event when an item is inserted', () => {
      const item = { id: '1', name: 'John' }
      const eventHandler = vi.fn()
      collection.on('added', eventHandler)

      collection.insert(item)

      expect(eventHandler).toHaveBeenCalledWith(item)
    })

    it('should throw an error if trying to insert an item with the same id', () => {
      const item = { id: '1', name: 'John' }

      collection.insert(item)

      expect(() => collection.insert(item)).toThrow()
    })

    it('should emit "insert" event', () => {
      const item = { id: '1', name: 'John' }
      const eventHandler = vi.fn()
      collection.on('insert', eventHandler)

      collection.insert(item)

      expect(eventHandler).toHaveBeenCalledWith(item)
    })
  })

  describe('updateOne', () => {
    it('should update a single item that matches the selector', () => {
      collection.insert({ id: '1', name: 'John' })

      collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      expect(collection.findOne({ id: '1' })).toEqual({ id: '1', name: 'Jane' })
    })

    it('should emit "changed" event when an item is updated', () => {
      collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('changed', eventHandler)

      collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jane' }, { $set: { name: 'Jane' } })
    })

    it('should not throw an error if no item matches the selector', () => {
      expect(collection.updateOne({
        id: '1',
      }, {
        $set: { name: 'Jane' },
      })).toBe(0)
    })

    it('should throw an error if trying to update the item id to a value that already exists', () => {
      collection.insert({ id: '1', name: 'John' })

      expect(() => collection.updateOne({ id: '1' }, { $set: { id: '1' } })).not.toThrow()
      expect(() => collection.updateOne({ id: '1' }, { $set: { id: '2' } })).toThrow()
    })

    it('should emit "updateOne" event', () => {
      collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('updateOne', eventHandler)

      collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' }, { $set: { name: 'Jane' } })
    })
  })

  describe('updateMany', () => {
    it('should update multiple items that match the selector', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })

      collection.updateMany({ name: 'John' }, { $set: { name: 'Jay' } })

      expect(collection.find({ name: 'Jay' }).fetch()).toEqual([
        { id: '1', name: 'Jay' },
        { id: '3', name: 'Jay' },
      ])
    })

    it('should emit "changed" event for each updated item', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('changed', eventHandler)

      collection.updateMany({ name: 'John' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledTimes(2)
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jane' }, { $set: { name: 'Jane' } })
      expect(eventHandler).toHaveBeenCalledWith({ id: '3', name: 'Jane' }, { $set: { name: 'Jane' } })
    })

    it('should emit "updateMany" event', () => {
      collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('updateMany', eventHandler)

      collection.updateMany({ id: '1' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' }, { $set: { name: 'Jane' } })
    })
  })

  describe('removeOne', () => {
    it('should remove an item that match the selector', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })

      collection.removeOne({ name: 'John' })

      expect(collection.find({ name: 'John' }).fetch()).toEqual([{ id: '3', name: 'John' }])
    })

    it('should emit "removed" event for the removed item', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('removed', eventHandler)

      collection.removeOne({ name: 'John' })

      expect(eventHandler).toHaveBeenCalledTimes(1)
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'John' })
    })

    it('should remove the index if the item is removed', () => {
      const id = 'test'
      collection.insert({ id, name: 'John' })
      expect(collection.findOne({ id })).toEqual({ id, name: 'John' })

      collection.removeOne({ id })
      expect(collection.findOne({ id })).toBeUndefined()

      collection.insert({ id, name: 'Jane' })
      expect(collection.findOne({ id })).toEqual({ id, name: 'Jane' })
    })

    it('should emit "removeOne" event', () => {
      collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('removeOne', eventHandler)

      collection.removeOne({ id: '1' })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' })
    })
  })

  describe('removeMany', () => {
    it('should remove items that match the selector', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })

      collection.removeMany({ name: 'John' })

      expect(collection.find({ name: 'John' }).fetch()).toEqual([])
    })

    it('should emit "removed" event for each removed item', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('removed', eventHandler)

      collection.removeMany({ name: 'John' })

      expect(eventHandler).toHaveBeenCalledTimes(2)
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'John' })
      expect(eventHandler).toHaveBeenCalledWith({ id: '3', name: 'John' })
    })

    it('should emit "removeMany" event', () => {
      collection.insert({ id: '1', name: 'John' })
      collection.insert({ id: '2', name: 'Jane' })
      collection.insert({ id: '3', name: 'John' })

      const eventHandler = vi.fn()
      collection.on('removeMany', eventHandler)

      collection.removeMany({ name: 'John' })

      expect(eventHandler).toHaveBeenCalledWith({ name: 'John' })
    })
  })

  describe('events', () => {
    it('shouldn\'t register any event listeners without reactivity', () => {
      const col = new Collection<{ id: string, name: string }>()
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      col.insert({ id: '1', name: 'John' })
      col.updateOne({ id: '1' }, { $set: { name: 'Jane' } })
      col.removeOne({ id: '1' })

      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      const cursor = col.find()
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      cursor.fetch()
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      cursor.observeChanges({})
      expect(col.listenerCount('added')).toBe(1)
      expect(col.listenerCount('changed')).toBe(1)
      expect(col.listenerCount('removed')).toBe(1)

      cursor.cleanup()
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      col.find({}, { reactive: false })
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)
    })

    it('should register event listeners in reactive scope', () => {
      const col = new Collection<{ id: string, name: string }>({
        reactivity: {
          create: () => ({
            depend: () => {
              // do nothing
            },
            notify: () => {
              // do nothing
            },
          }),
          onDispose: () => {
            // do nothing
          },
        },
      })
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      col.insert({ id: '1', name: 'John' })
      col.updateOne({ id: '1' }, { $set: { name: 'Jane' } })
      col.removeOne({ id: '1' })

      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      const cursor = col.find()
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      cursor.fetch()
      expect(col.listenerCount('added')).toBe(1)
      expect(col.listenerCount('changed')).toBe(1)
      expect(col.listenerCount('removed')).toBe(1)

      cursor.map(item => item)
      expect(col.listenerCount('added')).toBe(2)
      expect(col.listenerCount('changed')).toBe(2)
      expect(col.listenerCount('removed')).toBe(2)

      cursor.forEach(item => item)
      expect(col.listenerCount('added')).toBe(3)
      expect(col.listenerCount('changed')).toBe(3)
      expect(col.listenerCount('removed')).toBe(3)

      cursor.count()
      expect(col.listenerCount('added')).toBe(4)
      expect(col.listenerCount('changed')).toBe(4)
      expect(col.listenerCount('removed')).toBe(4)

      cursor.observeChanges({})
      expect(col.listenerCount('added')).toBe(5)
      expect(col.listenerCount('changed')).toBe(5)
      expect(col.listenerCount('removed')).toBe(5)

      cursor.cleanup()
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)

      col.find({}, { reactive: false })
      expect(col.listenerCount('added')).toBe(0)
      expect(col.listenerCount('changed')).toBe(0)
      expect(col.listenerCount('removed')).toBe(0)
    })
  })

  describe('performance', () => {
    const measureTime = (fn: () => void) => {
      const start = performance.now()
      fn()
      return performance.now() - start
    }

    it('should be faster with id only queries', async () => {
      const col = new Collection<{ id: string, name: string, num: number }>()

      // create items
      for (let i = 0; i < 1000; i += 1) {
        col.insert({ id: i.toString(), name: 'John', num: i })
      }

      // wait for the next tick to ensure the indices are ready
      await new Promise((resolve) => { setTimeout(resolve, 0) })

      const idQueryTime = measureTime(() => {
        const item = col.findOne({ id: '999' })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const nonIdQueryTime = measureTime(() => {
        const item = col.findOne({ num: 999 })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const percentage = (100 / nonIdQueryTime) * idQueryTime
      // eslint-disable-next-line no-console
      console.log('id index performance: ', { idQueryTime, nonIdQueryTime, percentage })

      // id query should use less than 10% of the time of a non-id query
      expect(percentage).toBeLessThan(10)
    })

    it('should be faster with field indices', async () => {
      const col1 = new Collection<{ id: string, name: string, num: number }>({
        indices: [createIndex('num')],
      })
      const col2 = new Collection<{ id: string, name: string, num: number }>()

      // create items
      for (let i = 0; i < 1000; i += 1) {
        col1.insert({ id: i.toString(), name: 'John', num: i })
        col2.insert({ id: i.toString(), name: 'John', num: i })
      }
      // wait for the next tick to ensure the indices are ready
      await new Promise((resolve) => { setTimeout(resolve, 0) })

      const indexQueryTime = measureTime(() => {
        const item = col1.findOne({ num: 999 })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const nonIndexQueryTime = measureTime(() => {
        const item = col2.findOne({ num: 999 })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const percentage = (100 / nonIndexQueryTime) * indexQueryTime
      // eslint-disable-next-line no-console
      console.log('field index performance: ', { indexQueryTime, nonIndexQueryTime, percentage })

      // index query should use less than 10% of the time of a non-index query
      expect(percentage).toBeLessThan(10)
    })
  }, { retry: 5 })

  describe('Collection Debug Mode', () => {
    it('should enable debug mode globally', () => {
      const col1 = new Collection<any>()
      expect(col1.getDebugMode()).toBe(false)

      Collection.enableDebugMode()
      const col2 = new Collection<any>()

      expect(col1.getDebugMode()).toBe(true)
      expect(col2.getDebugMode()).toBe(true)
    })

    it('should toggle debug mode', () => {
      Collection.debugMode = false
      const col = new Collection<any>()

      expect(col.getDebugMode()).toBe(false)

      col.setDebugMode(true)
      expect(col.getDebugMode()).toBe(true)

      col.setDebugMode(false)
      expect(col.getDebugMode()).toBe(false)
    })

    it('should enable debug mode and emit debug events', () => {
      // Create a new collection instance with debug mode enabled
      const col = new Collection<any>({ enableDebugMode: true })

      // Spy on EventEmitter's emit method to verify debug events are emitted
      const emitSpy = vi.spyOn(col, 'emit')

      // Perform operations to trigger debug events
      const item = { name: 'test' }
      col.insert(item)
      col.find({ name: 'test' })
      col.findOne({ name: 'test' })
      col.updateOne({ name: 'test' }, { $set: { name: 'updated' } })
      col.removeOne({ name: 'updated' })

      // Verify that debug events were emitted
      expect(emitSpy).toHaveBeenCalledWith(expect.stringContaining('_debug.insert'), expect.any(String), expect.any(Object))
      expect(emitSpy).toHaveBeenCalledWith(expect.stringContaining('_debug.find'), expect.any(String), expect.any(Object), expect.any(Object), expect.any(Object))
      expect(emitSpy).toHaveBeenCalledWith(expect.stringContaining('_debug.findOne'), expect.any(String), expect.any(Object), expect.any(Object), expect.any(Object))
      expect(emitSpy).toHaveBeenCalledWith(expect.stringContaining('_debug.updateOne'), expect.any(String), expect.any(Object), expect.any(Object))
      expect(emitSpy).toHaveBeenCalledWith(expect.stringContaining('_debug.removeOne'), expect.any(String), expect.any(Object))

      // Cleanup
      emitSpy.mockRestore()
    })

    it('should not emit debug events when debug mode is disabled', () => {
      // Create a new collection instance with debug mode disabled
      const col = new Collection<any>({ enableDebugMode: false })

      // Spy on EventEmitter's emit method to verify debug events are not emitted
      const emitSpy = vi.spyOn(col, 'emit')

      // Perform operations
      col.insert({ name: 'test' })

      // Verify that no debug events were emitted
      expect(emitSpy).not.toHaveBeenCalledWith(expect.stringContaining('_debug.insert'), expect.any(String), expect.any(Object))

      // Cleanup
      emitSpy.mockRestore()
    })
  })

  describe('misc', () => {
    it('should seed the collection with initial data from the memory adapter', () => {
      const col = new Collection<{ id: string, name: string }>({
        memory: createMemoryAdapter([{ id: '1', name: 'John' }]),
      })

      expect(col.findOne({ id: '1' })).toEqual({ id: '1', name: 'John' })
    })
  })
})
