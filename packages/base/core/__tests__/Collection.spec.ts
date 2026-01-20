import { vi, beforeEach, describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { infer as ZodInfer } from 'zod'
import { Collection, DefaultDataAdapter } from '../src'
import type { BaseItem, CollectionOptions, StorageAdapter, TransformAll } from '../src'
import type DataAdapter from '../src/DataAdapter'
import type Selector from '../src/types/Selector'
import type Modifier from '../src/types/Modifier'
import type ReactivityAdapter from '../src/types/ReactivityAdapter'
import type Dependency from '../src/types/Dependency'
import Cursor, { isInReactiveScope } from '../src/Collection/Cursor'
import Observer from '../src/Collection/Observer'
import createStorageAdapter from '../src/createStorageAdapter'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

describe('Collection', () => {
  let collection: Collection<{ id: string, name: string }>

  beforeEach(() => {
    collection = new Collection<{ id: string, name: string }>()
  })

  describe('findOne', () => {
    it('should find and return an item that matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      const item = await collection.findOne({ name: 'John' }, { async: true })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should return undefined if no item matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      const item = await collection.findOne({ name: 'Jane' }, { async: true })

      expect(item).toBeUndefined()
    })

    it('should return the first matching item if multiple items match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'John' })

      const item = await collection.findOne({ name: 'John' }, { async: true })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should emit "findOne" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      const eventHandler = vi.fn()
      collection.on('findOne', eventHandler)

      await collection.findOne({ name: 'John' }, { fields: { id: 1 }, async: true })

      expect(eventHandler).toHaveBeenCalledWith({ name: 'John' }, { fields: { id: 1 }, async: true }, { id: '1' })
    })

    it('should find and return an item synchronously when async is false', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      const item = collection.findOne({ name: 'John' })

      expect(item).toEqual({ id: '1', name: 'John' })
    })

    it('should return undefined synchronously if no item matches', async () => {
      await collection.insert({ id: '1', name: 'John' })

      const item = collection.findOne({ name: 'Jane' })

      expect(item).toBeUndefined()
    })

    it('should return the first matching item synchronously', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'John' })

      const item = collection.findOne({ name: 'John' })

      expect(item).toEqual({ id: '1', name: 'John' })
    })
  })

  describe('find', () => {
    it('should find and return items that match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      await collection.insert({ id: '3', name: 'John' })

      const items = await collection.find({ name: 'John' }, { async: true }).fetch()

      expect(items).toEqual([
        { id: '1', name: 'John' },
        { id: '3', name: 'John' },
      ])
    })

    it('should return an empty array if no items match the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      const items = await collection.find({ name: 'Jane' }, { async: true }).fetch()

      expect(items).toEqual([])
    })

    it('should emit "find" event', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })

      const eventHandler = vi.fn().mockImplementation((selector, options, cursor) => {
        expect(selector).toEqual({ name: 'John' })
        expect(options).toEqual({ fields: { id: 1 }, async: true })
        return cursor
      })

      collection.on('find', eventHandler)

      await collection.find({ name: 'John' }, { fields: { id: 1 }, async: true }).fetch()

      expect(eventHandler).toHaveBeenCalled()
      const cursor = eventHandler.mock.calls[0][2]
      await expect(cursor.fetch()).resolves.toEqual([{ id: '1' }])
    })
  })

  describe('insert', () => {
    it('should insert an item into the collection', async () => {
      const item = { id: '1', name: 'John' }

      await collection.insert(item)

      await expect(collection.findOne({ id: '1' }, { async: true })).resolves.toEqual(item)
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
      await expect(collection.find({}, { async: true }).fetch()).resolves.toEqual(items)
    })

    it('should not fail if empty array was passed', async () => {
      expect(await collection.insertMany([])).toEqual([])
    })
  })

  describe('updateOne', () => {
    it('should update a single item that matches the selector', async () => {
      await collection.insert({ id: '1', name: 'John' })

      await collection.updateOne({ id: '1' }, { $set: { name: 'Jane' } })

      await expect(collection.findOne({ id: '1' }, { async: true })).resolves.toEqual({ id: '1', name: 'Jane' })
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
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toBeUndefined()
    })

    it('should upsert items if upsert option is true', async () => {
      expect(await collection.updateOne({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
      }, { upsert: true })).toEqual(1)
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toMatchObject({ name: 'Upsert' })
    })

    it('should use $setOnInsert if upsert option is true', async () => {
      expect(await collection.updateOne({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
        $setOnInsert: {
          upserted: true,
        },
      }, { upsert: true })).toEqual(1)
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toMatchObject({ name: 'Upsert', upserted: true })
    })

    it('should ignore $setOnInsert if item was not upserted', async () => {
      await collection.insert({ id: '1', name: 'John' })
      expect(await collection.updateOne({ id: '1' }, {
        $set: { name: 'Jane' },
        $setOnInsert: { upserted: true },
      }, { upsert: true })).toEqual(1)

      await expect(collection.findOne({ id: '1' }, { async: true })).resolves.toEqual({ id: '1', name: 'Jane' })
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

      await expect(collection.find({ name: 'Jay' }, { async: true }).fetch()).resolves.toEqual([
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

      await expect(collection.findOne({ id: '1' }, { async: true })).resolves.toEqual({ id: '1', name: 'Jack' })
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
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toBeUndefined()
    })

    it('should upsert items if upsert option is true', async () => {
      expect(await collection.replaceOne({ id: 'asdf' }, {
        name: 'Upsert',
      }, { upsert: true })).toEqual(1)
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toMatchObject({ name: 'Upsert' })
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

      await expect(collection.find({ name: 'John' }, { async: true }).fetch()).resolves.toEqual([{ id: '3', name: 'John' }])
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
      await expect(collection.findOne({ id }, { async: true })).resolves.toEqual({ id, name: 'John' })

      await collection.removeOne({ id })
      await expect(collection.findOne({ id }, { async: true })).resolves.toBeUndefined()

      await collection.insert({ id, name: 'Jane' })
      await expect(collection.findOne({ id }, { async: true })).resolves.toEqual({ id, name: 'Jane' })
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
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toBeUndefined()
    })

    it('should upsert items if upsert option is true', async () => {
      expect(await collection.updateMany({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
      }, { upsert: true })).toEqual(1)
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toMatchObject({ name: 'Upsert' })
    })

    it('should use $setOnInsert if upsert option is true', async () => {
      expect(await collection.updateMany({ id: 'asdf' }, {
        $set: { name: 'Upsert' },
        $setOnInsert: {
          upserted: true,
        },
      }, { upsert: true })).toEqual(1)
      await expect(collection.findOne({ name: 'Upsert' }, { async: true })).resolves.toMatchObject({ name: 'Upsert', upserted: true })
    })

    it('should ignore $setOnInsert if item was not upserted', async () => {
      await collection.insert({ id: '1', name: 'John' })
      await collection.insert({ id: '2', name: 'Jane' })
      expect(await collection.updateMany({}, {
        $set: { updated: true },
        $setOnInsert: { upserted: true },
      }, { upsert: true })).toEqual(2)

      await expect(collection.find({}, { async: true }).fetch()).resolves.toEqual([
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

      await expect(collection.find({ name: 'John' }, { async: true }).fetch()).resolves.toEqual([])
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

  describe('performance', { retry: 0 }, () => {
    it('should be faster with id only queries', async () => {
      const col = new Collection<{ id: string, name: string, num: number }>()

      const measureAsyncTime = async (fn: () => Promise<void>) => {
        const start = performance.now()
        await fn()
        return performance.now() - start
      }

      // create items
      await col.batch(async () => {
        for (let i = 0; i < 1000; i += 1) {
          await col.insert({ id: i.toString(), name: 'John', num: i })
        }
      })

      const idQueryTime = await measureAsyncTime(async () => {
        const item = await col.findOne({ id: '999' }, { async: true })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const nonIdQueryTime = await measureAsyncTime(async () => {
        const item = await col.findOne({ num: 999 }, { async: true })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const percentage = (100 / nonIdQueryTime) * idQueryTime
      // eslint-disable-next-line no-console
      console.log('id index performance:', { idQueryTime, nonIdQueryTime, percentage })

      // id query should be significantly faster; allow CI variance
      expect(percentage).toBeLessThan(20)
    })

    it('should be faster with field indices', async () => {
      const col1 = new Collection<{ id: string, name: string, num: number }>({
        indices: ['num'],
      })
      const col2 = new Collection<{ id: string, name: string, num: number }>()

      const measureAsyncTime = async (fn: () => Promise<void>) => {
        const start = performance.now()
        await fn()
        return performance.now() - start
      }

      await Collection.batch(async () => {
        // create items
        for (let i = 0; i < 10_000; i += 1) {
          await col1.insert({ id: i.toString(), name: 'John', num: i })
          await col2.insert({ id: i.toString(), name: 'John', num: i })
        }
      })

      const indexQueryTime = await measureAsyncTime(async () => {
        const item = await col1.findOne({ num: 999 }, { async: true })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const nonIndexQueryTime = await measureAsyncTime(async () => {
        const item = await col2.findOne({ num: 999 }, { async: true })
        expect(item).toEqual({ id: '999', name: 'John', num: 999 })
      })

      const percentage = (100 / nonIndexQueryTime) * indexQueryTime
      // eslint-disable-next-line no-console
      console.log('field index performance:', { indexQueryTime, nonIndexQueryTime, percentage })

      // index query should be significantly faster; allow CI variance
      expect(percentage).toBeLessThan(20)
    })
  })

  describe('additional coverage: Collection/Cursor/Observer', () => {
    it('constructor supports persistence option and ready()', async () => {
      const persistence = createStorageAdapter<{ id: string, name: string }, string>({
        setup: async () => {},
        teardown: async () => {},
        readAll: async () => [],
        readIds: async () => [],
        createIndex: async () => {},
        dropIndex: async () => {},
        readIndex: async () => new Map(),
        insert: async () => {},
        replace: async () => {},
        remove: async () => {},
        removeAll: async () => {},
      })
      const c = new Collection<{ id: string, name: string }>({ name: 'pcol', persistence })
      await c.ready()
      expect(c.isReady()).toBe(true)
    })

    it('static and instance batch cover sync/async and nested', async () => {
      // Static batch with sync callback
      Collection.batch(() => { /* no-op */ })

      const c = new Collection<{ id: string, name: string }>()
      let innerRan = false
      // Nested instance batch should early-return on inner
      await c.batch(async () => {
        c.batch(() => {
          innerRan = true
        })
      })
      expect(innerRan).toBe(true)
    })

    it('isLoading and isReady accessors execute', () => {
      expect(collection.isLoading()).toBe(false)
      // Just call isReady for coverage without strict assertion on value
      void collection.isReady()
    })

    it('onPostBatch queues during batch and throws when disposed', async () => {
      let ran = false
      await collection.batch(async () => {
        collection.onPostBatch(() => {
          ran = true
        })
      })
      expect(ran).toBe(true)

      await collection.dispose()
      expect(() => collection.onPostBatch(() => {})).toThrow('Collection is disposed')
    })

    it('insertMany invalid items throws', async () => {
      // @ts-expect-error deliberate invalid input
      await expect(collection.insertMany(undefined)).rejects.toThrow('Invalid items')
    })

    it('updateOne/updateMany invalid args throw', async () => {
      await expect(
        collection.updateOne(
          undefined as unknown as Selector<{ id: string, name: string }>,
          undefined as unknown as Modifier<{ id: string, name: string }>,
        ),
      ).rejects.toThrow('Invalid selector')
      await expect(
        collection.updateOne(
          {} as unknown as Selector<{ id: string, name: string }>,
          undefined as unknown as Modifier<{ id: string, name: string }>,
        ),
      ).rejects.toThrow('Invalid modifier')
      await expect(
        collection.updateMany(
          undefined as unknown as Selector<{ id: string, name: string }>,
          {} as unknown as Modifier<{ id: string, name: string }>,
        ),
      ).rejects.toThrow('Invalid selector')
      await expect(
        collection.updateMany(
          {} as unknown as Selector<{ id: string, name: string }>,
          undefined as unknown as Modifier<{ id: string, name: string }>,
        ),
      ).rejects.toThrow('Invalid modifier')
    })

    it('findOne async path resolves item', async () => {
      await collection.insert({ id: 'x1', name: 'A' })
      await expect(collection.findOne({ id: 'x1' }, { async: true })).resolves.toEqual({ id: 'x1', name: 'A' })
    })

    it('find invalid selector throws', () => {
      // @ts-expect-error deliberate invalid
      expect(() => collection.find(123)).toThrow('Invalid selector')
    })

    // Avoid toggling global debug/field tracking to not affect other tests

    it('isInReactiveScope covers variants', () => {
      expect(isInReactiveScope(undefined)).toBe(false)
      // no isInScope => assume true
      expect(isInReactiveScope({} as unknown as ReactivityAdapter<Dependency>)).toBe(true)
      expect(isInReactiveScope({
        isInScope: () => false,
      } as unknown as ReactivityAdapter<Dependency>)).toBe(false)
      expect(isInReactiveScope({
        isInScope: () => true,
      } as unknown as ReactivityAdapter<Dependency>)).toBe(true)
    })

    it('Cursor.observeChanges default args, ignore falsy callbacks, requery early return', () => {
      const items = [{ id: '1', name: 'n1' }]
      const cursor = new Cursor(() => items)
      const stop = cursor.observeChanges({ added: undefined as any, removed: () => {} })
      stop()
      // Observer not created anymore; requery should early-return without throwing
      cursor.requery()
      expect(typeof stop).toBe('function')
    })

    it('Cursor.depend with reactive adapter and onDispose hook', () => {
      const reactive = {
        create: () => ({ depend: vi.fn(), notify: vi.fn() }),
        isInScope: () => true,
        onDispose: vi.fn(),
      } as any
      const cursor = new Cursor(() => [{ id: '1', n: 1 }], { reactive })
      cursor.forEach(() => {})
      expect((reactive.onDispose)).toHaveBeenCalled()
    })

    it('Observer basic paths: changed without changedField, movedBefore, removed, addedBefore', () => {
      const bind = () => () => {}
      const ob = new Observer<{ id: string, v?: number }>(bind)
      const added = vi.fn()
      const addedBefore = vi.fn()
      const changed = vi.fn()
      const movedBefore = vi.fn()
      const removed = vi.fn()
      ob.addCallbacks({ added, addedBefore, changed, movedBefore, removed })
      // initial items
      ob.runChecks(() => ([{ id: '1', v: 1 }, { id: '2', v: 2 }]))
      // change, move, remove, add
      ob.runChecks(() => ([{ id: '2', v: 3 }, { id: '1', v: 1 }, { id: '3', v: 9 }]))
      expect(changed).toHaveBeenCalled()
      expect(movedBefore).toHaveBeenCalled()
      expect(added).toHaveBeenCalled()
      expect(addedBefore).toHaveBeenCalled()
    })

    it('Observer.runChecks handles Promise result path', async () => {
      const ob = new Observer<{ id: string }>(() => () => {})
      const added = vi.fn()
      ob.addCallbacks({ added })
      ob.runChecks(() => Promise.resolve([{ id: 'a' }]))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(added).toHaveBeenCalled()
    })

    it('getItems async error path and private getItem sync path', async () => {
      const mockAdapter: any = {
        createCollectionBackend: () => ({
          insert: async (i: any) => i,
          updateOne: async () => [],
          updateMany: async () => [],
          replaceOne: async () => [],
          removeOne: async () => [],
          removeMany: async () => [],
          registerQuery: () => {},
          unregisterQuery: () => {},
          getQueryState: () => 'complete',
          onQueryStateChange: (_s: any, _o: any, callback: (s: any) => void) => {
            setTimeout(() => callback('error'), 0)
            return () => {}
          },
          getQueryError: () => new Error('boom'),
          getQueryResult: () => [],
          executeQuery: async () => [],
          dispose: async () => {},
          isReady: async () => {},
        }),
      }
      const c = new Collection<{ id: string, name?: string }>('mock', mockAdapter as unknown as DataAdapter)
      // async branch resolves to [] when backend succeeds
      await expect((c as any).getItems({}, { async: true })).resolves.toEqual([])
      // private getItem non-promise path
      const v = (c as any).getItem({}, { async: false })
      expect(v).toBeUndefined()
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

      await col.findOne({ name: 'test' }, { async: true })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.findOne')).toBe(true)

      await col.updateOne({ name: 'test' }, { $set: { name: 'updated' } })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.updateOne')).toBe(true)

      await col.removeOne({ name: 'updated' })
      expect(emitSpy.mock.calls.some(call => call[0] === '_debug.removeOne')).toBe(true)

      // Cleanup
      emitSpy.mockRestore()
    })

    it('should emit debug events for updateMany, replaceOne and removeMany', async () => {
      const col = new Collection<any>({ enableDebugMode: true })
      const emitSpy = vi.spyOn(col, 'emit')
      await col.insert({ id: '1', name: 'debug' })
      await col.insert({ id: '2', name: 'debug' })

      await col.updateMany({ name: 'debug' }, { $set: { flag: true } })
      expect(emitSpy).toHaveBeenCalledWith(
        '_debug.updateMany',
        expect.any(String),
        { name: 'debug' },
        { $set: { flag: true } },
      )

      await col.replaceOne({ id: '1' }, { name: 'replaced' })
      expect(emitSpy).toHaveBeenCalledWith(
        '_debug.replaceOne',
        expect.any(String),
        { id: '1' },
        { name: 'replaced' },
      )

      await col.removeMany({ name: 'replaced' })
      expect(emitSpy).toHaveBeenCalledWith(
        '_debug.removeMany',
        expect.any(String),
        { name: 'replaced' },
      )
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

    it('emits _debug.getItems when debug mode forbids the cached path', async () => {
      const col = new Collection<{ id: string, name: string }>({ enableDebugMode: true })
      const debugSpy = vi.fn()
      col.on('_debug.getItems', debugSpy)

      await col.insert({ id: '1', name: 'debug' })
      const results = col.find({ name: 'debug' }).fetch()
      expect(results).toEqual([{ id: '1', name: 'debug' }])

      expect(debugSpy).toHaveBeenCalledWith(
        expect.any(String),
        { name: 'debug' },
        expect.any(Number),
      )

      col.off('_debug.getItems', debugSpy)
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

        await expect(col.find({}, { async: true }).fetch()).resolves.toEqual([{ id: '1', name: 'John Doe' }])
        await expect(col.find({ name: 'John Doe' }, { async: true }).fetch()).resolves.toEqual([{ id: '1', name: 'John Doe' }])
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

    it('should call teardown on the storage adapter during dispose', async () => {
      const teardown = vi.fn()
      const dataAdapter = new DefaultDataAdapter({
        storage: () => ({
          setup: () => Promise.resolve(),
          readAll: () => Promise.resolve([]),
          teardown,
        }) as unknown as StorageAdapter<any, any>,
      })
      const col = new Collection('test', dataAdapter)
      await col.ready()
      await col.dispose()
      expect(teardown).toHaveBeenCalledOnce()
    })

    it('should not fail if id index gets modified during batch operation', async () => {
      const col = new Collection<{ id: string, name: string }>()
      await col.insert({ id: '1', name: 'John' })
      await col.insert({ id: '2', name: 'Jane' })
      await col.batch(async () => {
        await col.removeOne({ id: '1' })

        await expect(col.find({ id: '2' }, { async: true }).fetch()).resolves.toEqual([{ id: '2', name: 'Jane' }])
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
      await expect(col.findOne({ id: 'custom-id' }, { async: true })).resolves.toEqual({ id: 'custom-id', name: 'John' })
    })
  })
})

// Coverage extras consolidated from separate files
describe('Collection coverage extras', () => {
  it('toggles isPulling and isPushing signals', async () => {
    const c = new Collection<{ id: string, n?: number }>()
    await c.ready()
    const pullingBefore = c.isPulling()
    const p = c.find({}, { async: true }).fetch()
    const duringPulling = c.isPulling()
    await p
    const pullingAfter = c.isPulling()
    expect(pullingBefore).toBe(false)
    expect(duringPulling).toBe(true)
    expect(pullingAfter).toBe(false)

    const pushingBefore = c.isPushing()
    const ins = c.insert({ id: '1', n: 1 })
    const duringPushing = c.isPushing()
    await ins
    const pushingAfter = c.isPushing()
    expect(pushingBefore).toBe(false)
    expect(duringPushing).toBe(true)
    expect(pushingAfter).toBe(false)
  })

  it('profiles getItems when debug mode enabled', async () => {
    const c = new Collection<{ id: string }>()
    c.setDebugMode(true)
    await expect(c.find({}, { async: true }).fetch()).resolves.toEqual([])
    await c.ready()
  })

  it('queues onPostBatch during batch and runs after', async () => {
    const c = new Collection<{ id: string, n?: number }>()
    const order: string[] = []
    await c.batch(async () => {
      c.onPostBatch(() => order.push('after'))
      order.push('during')
      await c.insert({ id: '1', n: 1 })
    })
    expect(order).toEqual(['during', 'after'])
  })

  it('executes onPostBatch immediately outside batch', async () => {
    const c = new Collection<{ id: string }>()
    const fn = vi.fn()
    c.onPostBatch(fn)
    expect(fn).toHaveBeenCalled()
  })

  it('returns callback result when nested batch in progress', async () => {
    const c = new Collection<{ id: string }>()
    let innerRan = false
    await c.batch(async () => {
      await c.batch(async () => {
        innerRan = true
      })
    })
    expect(innerRan).toBe(true)
  })

  it('throws on invalid selector for find', () => {
    const c = new Collection<{ id: string }>()
    // invalid selector type
    expect(() => c.find('invalid' as unknown as never)).toThrow('Invalid selector')
  })

  it('disallows operations after dispose', async () => {
    const c = new Collection<{ id: string, n?: number }>()
    await c.insert({ id: '1', n: 1 })
    await c.dispose()
    expect(() => c.find({})).toThrow('Collection is disposed')
    await expect(c.insert({ id: '2' })).rejects.toThrow('Collection is disposed')
    await expect(c.updateOne({ id: '1' }, { $set: { n: 2 } })).rejects.toThrow('Collection is disposed')
    await expect(c.removeOne({ id: '1' })).rejects.toThrow('Collection is disposed')
  })
})
