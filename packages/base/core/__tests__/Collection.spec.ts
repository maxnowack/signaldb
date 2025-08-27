import { vi, beforeEach, describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { infer as ZodInfer } from 'zod'
import type { BaseItem, CollectionOptions, TransformAll } from '../src'
import { Collection } from '../src'
import waitForEvent from './helpers/waitForEvent'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

const measureTime = (fn: () => void) => {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('Collection', () => {
  let collection: Collection<{ id: string, name: string }>

  beforeEach(() => {
    collection = new Collection<{ id: string, name: string }>()
  })

  describe('findOne', () => {
    it('should find and return an item that matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      const item = collection.findOne({ name: 'John' })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should return undefined if no item matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      const item = collection.findOne({ name: 'Jane' })

      expect(item).toBeUndefined()
    })

    it('should return the first matching item if multiple items match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'John' })

      const item = collection.findOne({ name: 'John' })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should emit "findOne" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      const eventHandler = vi.fn()
      collection.on('findOne', eventHandler)

      collection.findOne({ name: 'John' }, { fields: { id: 1 } })

      expect(eventHandler).toHaveBeenCalledWith({ name: 'John' }, { fields: { id: 1 } }, { id: '1' })
    })
  })

  describe('find', () => {
    it('should find and return items that match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })

      const items = collection.find({ name: 'John' }).fetch()

      expect(items).toEqual([
        { id: '1', name: 'John' },
        { id: '3', name: 'John' },
      ])
    })

    it('should return an empty array if no items match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      const items = collection.find({ name: 'Jane' }).fetch()

      expect(items).toEqual([])
    })

    it('should emit "find" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

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
    it('should insert an item into the collection', async () => {
      const item = { id: '1', name: 'John' }

      await collection.insert(item)

      expect(collection.findOne({ id: '1' })).toEqual(item)
    })

    it('should emit "added" event when an item is inserted', async () => {
      const item = { id: '1', name: 'John' }
      const eventHandler = vi.fn()
      collection.on('added', eventHandler)

      await collection.insert(item)

      expect(eventHandler).toHaveBeenCalledWith(item)
    })

    it('should throw an error if trying to insert an item with the same id', async () => {
      const item = { id: '1', name: 'John' }

      await collection.insert(item)

      await expect(() => collection.insert(item)).rejects.toThrow()
    })

    it('should emit "insert" event', async () => {
      const item = { id: '1', name: 'John' }
      const eventHandler = vi.fn()
      collection.on('insert', eventHandler)

      await collection.insert(item)

      expect(eventHandler).toHaveBeenCalledWith(item)
    })
  })

  describe('insertMany', () => {
    it('should insert multiple items into the collection', async () => {
      const items = [
        { id: '1', name: 'John' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Jack' },
      ]

      const ids = await collection.insertMany(items)

      expect(ids).toEqual(['1', '2', '3'])
      expect(collection.find({}).fetch()).toEqual(items)
    })

    it('should not fail if empty array was passed', async () => {
      expect(await collection.insertMany([])).toEqual([])
    })
  })

  describe('updateOne', () => {
    it('should update a single item that matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      await collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      expect(collection.findOne({ id: '1' })).toEqual({ id: '1', name: 'Jane' })
    })

    it('should emit "changed" event when an item is updated', async () => {
      await collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('changed', eventHandler)

      await collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jane' }, { $set: { name: 'Jane' } })
    })

    it('should not throw an error if no item matches the selector', async () => {
      expect(await collection.updateOne({
        id: '1',
      }, {
        $set: { name: 'Jane' },
      })).toBe(0)
    })

    it('should throw an error if trying to update the item id to a value that already exists', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      await expect(collection.updateOne({ id: '1' }, {
        $set: { id: '1' },
      })).resolves.not.toThrow()
      await expect(() => collection.updateOne({ id: '1' }, {
        $set: { id: '2' },
      })).rejects.toThrow()
      await expect(collection.updateOne({ id: '1' }, {
        $set: { id: '3' },
      })).resolves.not.toThrow()
    })

    it('should emit "updateOne" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('updateOne', eventHandler)

      await collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' }, { $set: { name: 'Jane' } })
    })

    it('should not upsert items if upsert option was not specified', async () => {
      expect(await collection.updateOne({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
      })).toEqual(0)
      expect(collection.findOne({ name: 'Upsert' })).toEqual(undefined)
    })

    it('should upsert items if upsert option is true', async () => {
      expect(await collection.updateOne({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
      }, { upsert: true })).toEqual(1)
      expect(collection.findOne({ name: 'Upsert' })).toMatchObject({ name: 'Upsert' })
    })

    it('should use $setOnInsert if upsert option is true', async () => {
      expect(await collection.updateOne({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
        $setOnInsert: {
          upserted: true,
        },
      }, { upsert: true })).toEqual(1)
      expect(collection.findOne({ name: 'Upsert' })).toMatchObject({ name: 'Upsert', upserted: true })
    })

    it('should ignore $setOnInsert if item was not upserted', async () => {
      await collection.insert({ id: '1', name: 'John' })
      expect(await collection.updateOne({ id: '1' }, {
        $set: { name: 'Jane' },
        $setOnInsert: { upserted: true },
      }, { upsert: true })).toEqual(1)

      expect(collection.findOne({ id: '1' })).toEqual({ id: '1', name: 'Jane' })
    })

    it('should fail if there is an id conflict during upsert', async () => {
      await collection.insert({ id: '1', name: 'John' })

      await expect(() => collection.updateOne({ name: 'Jane' }, {
        $set: { name: 'Jane' },
        $setOnInsert: { id: '1' },
      }, { upsert: true })).rejects.toThrow()
    })
  })

  describe('updateMany', () => {
    it('should update multiple items that match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })

      await collection.updateMany({ name: 'John' }, { $set: { name: 'Jay' } })

      expect(collection.find({ name: 'Jay' }).fetch()).toEqual([
        { id: '1', name: 'Jay' },
        { id: '3', name: 'Jay' },
      ])
    })

    it('should emit "changed" event for each updated item', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('changed', eventHandler)

      await collection.updateMany({ name: 'John' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledTimes(2)
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jane' }, { $set: { name: 'Jane' } })
      expect(eventHandler).toHaveBeenCalledWith({ id: '3', name: 'Jane' }, { $set: { name: 'Jane' } })
    })

    it('should throw an error if trying to update the item id to a value that already exists', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      await expect(collection.updateMany({ id: '1' }, {
        $set: { id: '1' },
      })).resolves.not.toThrow()
      await expect(() => collection.updateMany({ id: '1' }, {
        $set: { id: '2' },
      })).rejects.toThrow()
      await expect(collection.updateMany({ id: '1' }, {
        $set: { id: '3' },
      })).resolves.not.toThrow()
    })

    it('should emit "updateMany" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('updateMany', eventHandler)

      await collection.updateMany({ id: '1' }, { $set: { name: 'Jane' } })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' }, { $set: { name: 'Jane' } })
    })
  })

  describe('replaceOne', () => {
    it('should replace a single item that matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      await collection.replaceOne({ id: '1' }, { name: 'Jack' })

      expect(collection.findOne({ id: '1' })).toEqual({ id: '1', name: 'Jack' })
    })

    it('should emit "changed" event when an item was replaced', async () => {
      await collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('changed', eventHandler)

      await collection.replaceOne({ id: '1' }, { name: 'Jack' })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jack' }, { name: 'Jack' })
    })

    it('should not throw an error if no item matches the selector', async () => {
      expect(await collection.replaceOne({ id: '1' }, { name: 'Jack' })).toBe(0)
    })

    it('should throw an error if trying to update the item id to a value that already exists', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      await expect(collection.replaceOne({ id: '1' }, {
        id: '1',
        name: 'Jack',
      })).resolves.not.toThrow()
      await expect(() => collection.replaceOne({ id: '1' }, {
        id: '2',
        name: 'Jack',
      })).rejects.toThrow()
      await expect(collection.replaceOne({ id: '1' }, {
        id: '3',
        name: 'Jack',
      })).resolves.not.toThrow()
    })

    it('should emit "replaceOne" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('replaceOne', eventHandler)

      await collection.replaceOne({ id: '1' }, { name: 'Jack' })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' }, { name: 'Jack' })
    })

    it('should not upsert items if upsert option was not specified', async () => {
      expect(await collection.replaceOne({ id: 'asdf' }, { name: 'Upsert' })).toEqual(0)
      expect(collection.findOne({ name: 'Upsert' })).toEqual(undefined)
    })

    it('should upsert items if upsert option is true', async () => {
      expect(await collection.replaceOne({ id: 'asdf' }, {
        name: 'Upsert',
      }, { upsert: true })).toEqual(1)
      expect(collection.findOne({ name: 'Upsert' })).toMatchObject({ name: 'Upsert' })
    })

    it('should fail if there is an id conflict during upsert', async () => {
      await collection.insert({ id: '1', name: 'John' })

      await expect(() => collection.replaceOne({ name: 'Jane' }, {
        id: '1',
        name: 'Jane',
      }, { upsert: true })).rejects.toThrow()
    })
  })

  describe('removeOne', () => {
    it('should remove an item that match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })

      await collection.removeOne({ name: 'John' })

      expect(collection.find({ name: 'John' }).fetch()).toEqual([{ id: '3', name: 'John' }])
    })

    it('should emit "removed" event for the removed item', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('removed', eventHandler)

      await collection.removeOne({ name: 'John' })

      expect(eventHandler).toHaveBeenCalledTimes(1)
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'John' })
    })

    it('should remove the index if the item is removed', async () => {
      const id = 'test'
      await collection.insert({ id, name: 'John' })
      expect(collection.findOne({ id })).toEqual({ id, name: 'John' })

      await collection.removeOne({ id })
      expect(collection.findOne({ id })).toBeUndefined()

      await collection.insert({ id, name: 'Jane' })
      expect(collection.findOne({ id })).toEqual({ id, name: 'Jane' })
    })

    it('should emit "removeOne" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('removeOne', eventHandler)

      await collection.removeOne({ id: '1' })

      expect(eventHandler).toHaveBeenCalledWith({ id: '1' })
    })

    it('should not upsert items if upsert option was not specified', async () => {
      expect(await collection.updateMany({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
      })).toEqual(0)
      expect(collection.findOne({ name: 'Upsert' })).toEqual(undefined)
    })

    it('should upsert items if upsert option is true', async () => {
      expect(await collection.updateMany({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
      }, { upsert: true })).toEqual(1)
      expect(collection.findOne({ name: 'Upsert' })).toMatchObject({ name: 'Upsert' })
    })

    it('should use $setOnInsert if upsert option is true', async () => {
      expect(await collection.updateMany({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
        $setOnInsert: {
          upserted: true,
        },
      }, { upsert: true })).toEqual(1)
      expect(collection.findOne({ name: 'Upsert' })).toMatchObject({ name: 'Upsert', upserted: true })
    })

    it('should ignore $setOnInsert if item was not upserted', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      expect(await collection.updateMany({}, {
        $set: { updated: true },
        $setOnInsert: { upserted: true },
      }, { upsert: true })).toEqual(2)

      expect(collection.find().fetch()).toEqual([
        { id: '1', name: 'John', updated: true },
        { id: '2', name: 'Jane', updated: true },
      ])
    })

    it('should fail if there is an id conflict during upsert', async () => {
      await collection.insert({ id: '1', name: 'John' })

      await expect(() => collection.updateMany({ name: 'Jane' }, {
        $set: { name: 'Jane' },
        $setOnInsert: { id: '1' },
      }, { upsert: true })).rejects.toThrow()
    })
  })

  describe('removeMany', () => {
    it('should remove items that match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })

      await collection.removeMany({ name: 'John' })

      expect(collection.find({ name: 'John' }).fetch()).toEqual([])
    })

    it('should emit "removed" event for each removed item', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })
      const eventHandler = vi.fn()
      collection.on('removed', eventHandler)

      await collection.removeMany({ name: 'John' })

      expect(eventHandler).toHaveBeenCalledTimes(2)
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'John' })
      expect(eventHandler).toHaveBeenCalledWith({ id: '3', name: 'John' })
    })

    it('should emit "removeMany" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })

      const eventHandler = vi.fn()
      collection.on('removeMany', eventHandler)

      await collection.removeMany({ name: 'John' })

      expect(eventHandler).toHaveBeenCalledWith({ name: 'John' })
    })
  })

  describe('isLoading', () => {
    it('should ouput the correct value without persistence', async () => {
      const col = new Collection()
      expect(col.isLoading()).toBe(false)
    })

    it('should ouput the correct value with persistence', async () => {
      const col = new Collection({
        persistence: {
          register: () => new Promise((resolve) => {
            setTimeout(() => resolve(), 100)
          }),
          load: () => Promise.resolve({ items: [{ id: '1', name: 'Item 1' }] }),
          save: () => Promise.resolve(),
        },
      })
      await waitForEvent(col, 'persistence.pullStarted')
      expect(col.isLoading()).toBe(true)
      expect(col.find().fetch()).toEqual([])
      await waitForEvent(col, 'persistence.init')
      expect(col.isLoading()).toBe(false)
      expect(col.find().fetch()).toEqual([{ id: '1', name: 'Item 1' }])
    })
  })

  describe('performance', { retry: 0 }, () => {
    it('should be faster with id only queries', async () => {
      const col = new Collection<{ id: string, name: string, num: number }>()

      // create items
      await col.batch(async () => {
        for (let i = 0; i < 1000; i += 1) {
          await col.insert({ id: i.toString(), name: 'John', num: i })
        }
      })

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
      console.log('id index performance:', { idQueryTime, nonIdQueryTime, percentage })

      // id query should use less than 10% of the time of a non-id query
      expect(percentage).toBeLessThan(10)
    })

    it('should be faster with field indices', async () => {
      const col1 = new Collection<{ id: string, name: string, num: number }>({
        indices: ['num'],
      })
      const col2 = new Collection<{ id: string, name: string, num: number }>()

      await Collection.batch(async () => {
        // create items
        for (let i = 0; i < 10_000; i += 1) {
          await col1.insert({ id: i.toString(), name: 'John', num: i })
          await col2.insert({ id: i.toString(), name: 'John', num: i })
        }
      })

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
      console.log('field index performance:', { indexQueryTime, nonIndexQueryTime, percentage })

      // index query should use less than 10% of the time of a non-index query
      expect(percentage).toBeLessThan(10)
    })
  })

  describe('Field Tracking', () => {
    it('should enable field tracking globally', async () => {
      const col1 = new Collection<any>()
      // @ts-expect-error private property
      expect(col1.fieldTracking).toBe(false)

      Collection.setFieldTracking(true)

      const col2 = new Collection<any>()
      // @ts-expect-error private property
      expect(col1.fieldTracking).toBe(true)
      // @ts-expect-error private property
      expect(col2.fieldTracking).toBe(true)
    })

    it('should toggle field tracking', async () => {
      Collection.setFieldTracking(false)
      const col = new Collection<any>()
      // @ts-expect-error private property
      expect(col.fieldTracking).toBe(false)

      col.setFieldTracking(true)
      // @ts-expect-error private property
      expect(col.fieldTracking).toBe(true)

      col.setFieldTracking(false)
      // @ts-expect-error private property
      expect(col.fieldTracking).toBe(false)
    })
  })

  describe('Collection Debug Mode', () => {
    it('should enable debug mode globally', async () => {
      const col1 = new Collection<any>()
      expect(col1.getDebugMode()).toBe(false)

      Collection.enableDebugMode()
      const col2 = new Collection<any>()

      expect(col1.getDebugMode()).toBe(true)
      expect(col2.getDebugMode()).toBe(true)
    })

    it('should toggle debug mode', async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Collection.debugMode = false
      const col = new Collection<any>()

      expect(col.getDebugMode()).toBe(false)

      col.setDebugMode(true)
      expect(col.getDebugMode()).toBe(true)

      col.setDebugMode(false)
      expect(col.getDebugMode()).toBe(false)
    })

    it('should enable debug mode and emit debug events', async () => {
      // Create a new collection instance with debug mode enabled
      const col = new Collection<any>({ enableDebugMode: true })

      // Spy on EventEmitter's emit method to verify debug events are emitted
      const emitSpy = vi.spyOn(col, 'emit')

      // Perform operations to trigger debug events
      const item = { name: 'test' }
      await col.insert(item)
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.insert')).toBe(true)

      col.find({ name: 'test' })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.find')).toBe(true)

      col.findOne({ name: 'test' })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.findOne')).toBe(true)

      await col.updateOne({ name: 'test' }, { $set: { name: 'updated' } })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.updateOne')).toBe(true)

      await col.removeOne({ name: 'updated' })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.removeOne')).toBe(true)

      // Cleanup
      emitSpy.mockRestore()
    })

    it('should not emit debug events when debug mode is disabled', async () => {
      // Create a new collection instance with debug mode disabled
      const col = new Collection<any>({ enableDebugMode: false })

      // Spy on EventEmitter's emit method to verify debug events are not emitted
      const emitSpy = vi.spyOn(col, 'emit')

      // Perform operations
      await col.insert({ name: 'test' })

      // Verify that no debug events were emitted
      expect(emitSpy).not.toHaveBeenCalledWith(expect.stringContaining('_debug.insert'), expect.any(String), expect.any(Object))

      // Cleanup
      emitSpy.mockRestore()
    })
  })

  describe('Schema Validation', () => {
    interface SchemaCollectionOptions<
      T extends z.ZodType<BaseItem<I>>,
      I,
      E extends z.ZodType<BaseItem<I>> = T,
      U = ZodInfer<E>,
    > extends CollectionOptions<ZodInfer<T>, I, ZodInfer<E>, U> {
      schema: T,
    }

    class SchemaCollection<
      T extends z.ZodType<BaseItem<I>>,
      I = any,
      E extends z.ZodType<BaseItem<I>> = T,
      U = ZodInfer<E>,
    > extends Collection<ZodInfer<T>, I, ZodInfer<E>, U> {
      private schema: T

      constructor(options: SchemaCollectionOptions<T, I, E, U>) {
        super(options)
        this.schema = options.schema
        this.on('validate', (item) => {
          this.schema.parse(item)
        })
      }
    }

    it('should validate the schema without errors', async () => {
      const Posts = new SchemaCollection({
        schema: z.object({
          id: z.string(),
          title: z.string(),
          content: z.string(),
          published: z.boolean().optional(),
        }),
      })

      expect(() => Posts.insert({
        id: '1',
        title: 'Hello',
        content: 'World',
      })).not.toThrowError()

      expect(() => Posts.updateOne({
        id: '1',
      }, {
        $set: { published: true },
      })).not.toThrowError()

      expect(() => Posts.updateMany({}, {
        $set: { published: true },
      })).not.toThrowError()

      expect(() => Posts.replaceOne({
        id: '1',
      }, {
        title: 'Hello',
        content: 'World',
      })).not.toThrowError()
    })

    it('should validate the schema and throw errors', async () => {
      const Posts = new SchemaCollection({
        schema: z.object({
          id: z.string(),
          title: z.string(),
          content: z.string(),
          published: z.boolean().optional(),
        }),
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await expect(() => Posts.insert({
        id: '1',
        content: 'World',
      } as any)).rejects.toThrowError()

      await expect(Posts.updateOne({
        id: '1',
      }, {
        $set: { foo: true },
      })).resolves.not.toThrowError()

      await expect(Posts.updateMany({}, {
        $set: { bar: true },
      })).resolves.not.toThrowError()

      await expect(Posts.replaceOne({
        id: '1',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      }, {
        title: 'Hello',
        content: 'World',
        asdf: true,
      } as any)).resolves.not.toThrowError()
    })
  })

  describe('misc', () => {
    it('should get all collections with Collection.getCollections()', async () => {
      const col1 = new Collection<any>()
      const col2 = new Collection<any>()

      expect(Collection.getCollections()).toEqual(expect.arrayContaining([col1, col2]))
    })

    it('should call the onCreation hook', async () => {
      const onCreation = vi.fn()
      Collection.onCreation(onCreation)
      const col = new Collection<any>()

      expect(onCreation).toHaveBeenCalledWith(col)
    })

    it('should call the onDispose hook', async () => {
      const onDispose = vi.fn()
      Collection.onDispose(onDispose)
      const col = new Collection<any>()
      await col.dispose()

      expect(onDispose).toHaveBeenCalledWith(col)
    })

    it('should disable indexing temporarily if indices are outdated', async () => {
      const col = new Collection<{ id: string, name: string }>({
        indices: ['name'],
      })
      await col.batch(async () => {
        await col.insert({ id: '1', name: 'John' })
        await col.insert({ id: '2', name: 'Jane' })
        await col.updateOne({ id: '1' }, { $set: { name: 'John Doe' } })
        await col.removeOne({ id: '2' })

        expect(col.find().fetch()).toEqual([{ id: '1', name: 'John Doe' }])
        expect(col.find({ name: 'John Doe' }).fetch()).toEqual([{ id: '1', name: 'John Doe' }])
      })
    })

    it('should dipose the collection', async () => {
      const col = new Collection<{ id: string, name: string }>()
      await col.insert({ id: '1', name: 'John' })
      await col.dispose()

      expect(() => col.find()).toThrowError('Collection is disposed')
      expect(() => col.findOne({})).toThrowError('Collection is disposed')
      await expect(() => col.insert({ name: 'Jane' })).rejects.toThrowError('Collection is disposed')
      await expect(() => col.insertMany([{ name: 'Jerry' }])).rejects.toThrowError('Collection is disposed')
      await expect(() => col.updateOne({}, {})).rejects.toThrowError('Collection is disposed')
      await expect(() => col.updateMany({}, {})).rejects.toThrowError('Collection is disposed')
      await expect(() => col.removeOne({})).rejects.toThrowError('Collection is disposed')
      await expect(() => col.removeMany({})).rejects.toThrowError('Collection is disposed')
    })

    it('should call unregister on the persistence adapter during dispose', async () => {
      const unregister = vi.fn()
      const col = new Collection({
        persistence: {
          register: () => Promise.resolve(),
          unregister,
          load: () => Promise.resolve({ items: [] }),
          save: () => Promise.resolve(),
        },
      })
      await col.dispose()
      expect(unregister).toHaveBeenCalledOnce()
    })

    it('should not fail if id index gets modified during batch operation', async () => {
      const col = new Collection<{ id: string, name: string }>()
      await col.insert({ id: '1', name: 'John' })
      await col.insert({ id: '2', name: 'Jane' })
      await col.batch(async () => {
        await col.removeOne({ id: '1' })

        expect(col.find({ id: '2' }).fetch()).toEqual([{ id: '2', name: 'Jane' }])
      })
    })

    it('should indicate batch operation during batch operation', async () => {
      const col = new Collection<{ id: string, name: string }>()
      const fn = vi.fn().mockResolvedValue(undefined)
      await col.batch(async () => {
        await fn()
        expect(col.isBatchOperationInProgress()).toBe(true)
      })
      expect(col.isBatchOperationInProgress()).toBe(false)
      expect(fn).toHaveBeenCalledOnce()
    })

    it('should wait until a collection is ready', async () => {
      const col1 = new Collection<{ id: string, name: string }>({
        persistence: memoryStorageAdapter(),
      })
      let persistenceInit = false
      col1.once('persistence.init', () => {
        persistenceInit = true
      })
      await expect(col1.isReady()).resolves.toBeUndefined()
      expect(persistenceInit).toBe(true)

      const col2 = new Collection<{ id: string, name: string }>()
      await expect(col2.isReady()).resolves.toBeUndefined()
    })

    it('correctly transform entities', async () => {
      const col1 = new Collection({
        persistence: memoryStorageAdapter(),
      })

      interface TestItem {
        id: number,
        parent?: any,
      }

      const transformAll: TransformAll<BaseItem, TestItem> = (items, fields) => {
        if (fields?.parent) {
          const foreignKeys = [...new Set(items.map(item => item.parent))]
          const relatedItems = col1.find({ id: { $in: foreignKeys } }).fetch()
          items.forEach((item) => {
            item.parent = relatedItems.find(related => related.id === item.parent)
          })
        }
        return items
      }
      await col1.insert({ id: '1', name: 'John' })
      await col1.insert({ id: '2', name: 'Jane' })

      const col2 = new Collection({ transformAll })

      await col2.insert({ id: '1', name: 'John', parent: '1' })
      await col2.insert({ id: '2', name: 'Jane', parent: '2' })

      expect(col2.find({ id: '1' }, { fields: { id: 1, name: 1, parent: 1 } }).fetch()).toEqual([{ id: '1', name: 'John', parent: { id: '1', name: 'John' } }])
      expect(col2.find({ id: '2' }, { fields: { id: 1, name: 1 } }).fetch()).toEqual([{ id: '2', name: 'Jane' }])

      await col1.updateOne({ id: '1' }, { $set: { name: 'John Doe' } })
      expect(col2.find({ id: '1' }, { fields: { id: 1, name: 1, parent: 1 } }).fetch()).toEqual([{ id: '1', name: 'John', parent: { id: '1', name: 'John Doe' } }])
    })
  })

  describe('Custom Primary Key Generator', () => {
    it('should use custom primary key generator', async () => {
      const col = new Collection<{ id: string, name: string }>({
        primaryKeyGenerator: () => 'custom-id',
      })
      await col.insert({ name: 'John' })
      expect(col.findOne({ id: 'custom-id' })).toEqual({ id: 'custom-id', name: 'John' })
    })
  })
})
