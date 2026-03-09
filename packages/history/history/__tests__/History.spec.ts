import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Collection, type BaseItem } from '@signaldb/core'
import { SignalDBHistory } from '../src/index'

interface TestItem extends BaseItem<number> {
  id: number,
  value: string,
}

/**
 * Sets up a collection for the test
 * @returns the collection
 */
function createCollection() {
  const collection = new Collection<TestItem, number>()
  return collection
}

describe('SignalDBHistory', () => {
  let history: SignalDBHistory
  let collection: Collection<TestItem, number>
  let item: TestItem

  beforeEach(() => {
    history = new SignalDBHistory(10)
    collection = createCollection()
    history.addCollection(collection)
    item = { id: 1, value: 'a' }
  })

  it('should record insert operation and undo/redo', () => {
    collection.insert(item)
    expect(collection.findOne({ id: 1 })?.value).toBe('a')
    history.undo()
    expect(collection.findOne({ id: 1 })).toBeUndefined()
    history.redo()
    expect(collection.findOne({ id: 1 })?.value).toBe('a')
  })

  it('should record update operation and undo/redo', () => {
    collection.insert(item)
    collection.updateOne({ id: 1 }, { $set: { value: 'b' } })
    expect(collection.findOne({ id: 1 })?.value).toBe('b')
    history.undo()
    expect(collection.findOne({ id: 1 })?.value).toBe('a')
    history.redo()
    expect(collection.findOne({ id: 1 })?.value).toBe('b')
  })

  it('should record remove operation and undo/redo', () => {
    collection.insert(item)
    collection.removeOne({ id: 1 })
    expect(collection.findOne({ id: 1 })).toBeUndefined()
    history.undo()
    expect(collection.findOne({ id: 1 })?.value).toBe('a')
    history.redo()
    expect(collection.findOne({ id: 1 })).toBeUndefined()
  })

  it('should handle batch operations', () => {
    Collection.batch(() => {
      collection.insert({ id: 2, value: 'x' })
      collection.insert({ id: 3, value: 'y' })
    })
    expect(collection.findOne({ id: 2 })?.value).toBe('x')
    expect(collection.findOne({ id: 3 })?.value).toBe('y')
    history.undo()
    expect(collection.findOne({ id: 2 })).toBeUndefined()
    expect(collection.findOne({ id: 3 })).toBeUndefined()
    history.redo()
    expect(collection.findOne({ id: 2 })?.value).toBe('x')
    expect(collection.findOne({ id: 3 })?.value).toBe('y')
  })

  it('should not exceed max history length', () => {
    for (let i = 0; i < 12; i++) {
      collection.insert({ id: i, value: `${i}` })
    }
    expect(history['history'].length).toBeLessThanOrEqual(10)
  })

  it('should cut branch when operating after undo', () => {
    collection.insert(item)
    // Insert should be added to history
    expect(history['history'].length).toBe(1)
    history.undo()
    // Undoing should not affect history, only position in history
    expect(history['history'].length).toBe(1)
    // Creating new operation after undo should cut the branch and add to history
    collection.insert({ id: 2, value: 'b' })
    expect(history['history'].length).toBe(1)
  })

  it('should destroy listeners', () => {
    const offSpy = vi.spyOn(collection, 'off')
    history.destroy()
    expect(offSpy).toHaveBeenCalled()
  })

  it('should handle multiple undos/redos', () => {
    collection.insert({ id: 1, value: 'a' })
    collection.insert({ id: 2, value: 'b' })
    collection.insert({ id: 3, value: 'c' })
    history.undo()
    history.undo()
    expect(collection.findOne({ id: 3 })).toBeUndefined()
    expect(collection.findOne({ id: 2 })).toBeUndefined()
    expect(collection.findOne({ id: 1 })?.value).toBe('a')
    history.redo()
    expect(collection.findOne({ id: 2 })?.value).toBe('b')
    history.redo()
    expect(collection.findOne({ id: 3 })?.value).toBe('c')
  })

  it('should not undo if nothing left', () => {
    collection.insert(item)
    history.undo()
    history.undo()
    expect(collection.findOne({ id: 1 })).toBeUndefined()
  })

  it('should not redo if nothing left', () => {
    collection.insert(item)
    history.undo()
    history.redo()
    history.redo()
    expect(collection.findOne({ id: 1 })?.value).toBe('a')
  })
})
