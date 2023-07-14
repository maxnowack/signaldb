import { vi, beforeEach, describe, it, expect } from 'vitest'
import { Collection } from '../src/index'

describe('Collection', () => {
  let collection: Collection<{ id: string, name: string }>

  beforeEach(() => {
    collection = new Collection<{ id: string, name: string }>({
      memory: [],
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
  })

  describe('insert', () => {
    it('should insert an item into the collection', () => {
      const item = { id: '1', name: 'John' }

      collection.insert(item)

      expect(collection.findOne({ id: '1' })).toEqual(item)
    })

    it('should emit "inserted" event when an item is inserted', () => {
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

      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jane' })
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
      expect(eventHandler).toHaveBeenCalledWith({ id: '1', name: 'Jane' })
      expect(eventHandler).toHaveBeenCalledWith({ id: '3', name: 'Jane' })
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
  })
})
