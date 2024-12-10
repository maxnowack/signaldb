import { describe, it, expect } from 'vitest'
import { Collection } from '../src'

describe('Queries', () => {
  // thanks to https://github.com/meteor/meteor/blob/devel/packages/minimongo/minimongo_tests_client.js
  it('should pass all the basics', () => {
    const c = new Collection()
    let count

    const fluffyKittenId = c.insert({ type: 'kitten', name: 'fluffy' })
    c.insert({ type: 'kitten', name: 'snookums' })
    c.insert({ type: 'cryptographer', name: 'alice' })
    c.insert({ type: 'cryptographer', name: 'bob' })
    c.insert({ type: 'cryptographer', name: 'cara' })
    expect(c.find().count()).toBe(5)
    expect(c.find({ type: 'kitten' }).count()).toBe(2)
    expect(c.find({ type: 'cryptographer' }).count()).toBe(3)
    expect(c.find({ type: 'kitten' }).fetch().length).toBe(2)
    expect(c.find({ type: 'cryptographer' }).fetch().length).toBe(3)
    expect(fluffyKittenId).toBe(c.findOne({ type: 'kitten', name: 'fluffy' })?.id)

    c.removeMany({ name: 'cara' })
    expect(c.find().count()).toBe(4)
    expect(c.find({ type: 'kitten' }).count()).toBe(2)
    expect(c.find({ type: 'cryptographer' }).count()).toBe(2)
    expect(c.find({ type: 'kitten' }).fetch().length).toBe(2)
    expect(c.find({ type: 'cryptographer' }).fetch().length).toBe(2)

    count = c.updateMany({ name: 'snookums' }, { $set: { type: 'cryptographer' } })
    expect(count).toBe(1)
    expect(c.find().count()).toBe(4)
    expect(c.find({ type: 'kitten' }).count()).toBe(1)
    expect(c.find({ type: 'cryptographer' }).count()).toBe(3)
    expect(c.find({ type: 'kitten' }).fetch().length).toBe(1)
    expect(c.find({ type: 'cryptographer' }).fetch().length).toBe(3)

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    expect(() => c.removeMany(null)).toThrow()
    // @ts-ignore
    expect(() => c.removeMany(false)).toThrow()
    // @ts-ignore
    expect(() => c.removeMany(undefined)).toThrow()
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    expect(c.find().count()).toBe(4)

    c.removeOne({ id: null })
    c.removeOne({ id: false })
    c.removeOne({ id: undefined })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.removeMany()).toThrow()
    expect(c.find().count()).toBe(4)

    count = c.removeMany({})
    expect(count).toBe(4)
    expect(c.find().count()).toBe(0)

    c.insert({ id: 1, name: 'strawberry', tags: ['fruit', 'red', 'squishy'] })
    c.insert({ id: 2, name: 'apple', tags: ['fruit', 'red', 'hard'] })
    c.insert({ id: 3, name: 'rose', tags: ['flower', 'red', 'squishy'] })

    expect(c.find({ tags: 'flower' }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }).count()).toBe(2)
    expect(c.find({ tags: 'red' }).count()).toBe(3)
    expect(c.find({ tags: 'flower' }).fetch().length).toBe(1)
    expect(c.find({ tags: 'fruit' }).fetch().length).toBe(2)
    expect(c.find({ tags: 'red' }).fetch().length).toBe(3)

    expect(c.findOne({ id: 1 })?.name).toBe('strawberry')
    expect(c.findOne({ id: 2 })?.name).toBe('apple')
    expect(c.findOne({ id: 3 })?.name).toBe('rose')
    expect(c.findOne({ id: 4 })).toBeUndefined()
    expect(c.findOne({ id: 'abc' })).toBeUndefined()
    expect(c.findOne({ id: undefined })).toBeUndefined()

    expect(c.find({ id: 1 }).count()).toBe(1)
    expect(c.find({ id: 4 }).count()).toBe(0)
    expect(c.find({ id: 'abc' }).count()).toBe(0)
    expect(c.find({ id: undefined }).count()).toBe(0)
    expect(c.find().count()).toBe(3)
    expect(c.find({ id: 1 }, { skip: 1 }).count()).toBe(0)
    expect(c.find({ id: 1 }, { skip: 1 }).count()).toBe(0)
    expect(c.find({ id: undefined }).count()).toBe(0)
    expect(c.find({ id: false }).count()).toBe(0)
    expect(c.find({ id: null }).count()).toBe(0)
    expect(c.find({ id: '' }).count()).toBe(0)
    expect(c.find({ id: 0 }).count()).toBe(0)
    expect(c.find({}, { skip: 1 }).count()).toBe(2)
    expect(c.find({}, { skip: 2 }).count()).toBe(1)
    expect(c.find({}, { limit: 2 }).count()).toBe(2)
    expect(c.find({}, { limit: 1 }).count()).toBe(1)
    expect(c.find({}, { skip: 1, limit: 1 }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }, { skip: 1 }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }, { limit: 1 }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }, { skip: 1, limit: 1 }).count()).toBe(1)
    expect(c.find({ id: 1 }, { sort: { id: -1 }, skip: 1 }).count()).toBe(0)
    expect(c.find({}, { sort: { id: -1 }, skip: 1 }).count()).toBe(2)
    expect(c.find({}, { sort: { id: -1 }, skip: 2 }).count()).toBe(1)
    expect(c.find({}, { sort: { id: -1 }, limit: 2 }).count()).toBe(2)
    expect(c.find({}, { sort: { id: -1 }, limit: 1 }).count()).toBe(1)
    expect(c.find({}, { sort: { id: -1 }, skip: 1, limit: 1 }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }, { sort: { id: -1 }, skip: 1 }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }, { sort: { id: -1 }, limit: 1 }).count()).toBe(1)
    expect(c.find({ tags: 'fruit' }, { sort: { id: -1 }, skip: 1, limit: 1 }).count()).toBe(1)

    c.insert({ foo: { bar: 'baz' } })
    expect(c.find({ foo: { bam: 'baz' } }).count()).toBe(0)
    expect(c.find({ foo: { bar: 'baz' } }).count()).toBe(1)
  })

  it('should handle errors', () => {
    const c = new Collection()

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.insert(null)).toThrow()

    // Test find with invalid query
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.find(null)).toThrow()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.find(123)).toThrow()

    // Test updateMany with invalid data
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.updateMany({ id: 1 }, null)).toThrow()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.updateMany(null, { $set: { name: 'new name' } })).toThrow()

    // Test removeOne with invalid data
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => c.removeOne(null)).toThrow()
  })

  it('should handle edge cases', () => {
    const c = new Collection()

    // Test insert, find, updateMany, removeMany, removeOne with empty data
    expect(c.insert({})).toBeDefined()
    expect(c.find({}).count()).toBe(1)
    expect(c.updateMany({}, { $set: { name: 'empty' } })).toBe(1)
    expect(c.removeMany({})).toBe(1)
    expect(c.removeOne({})).toBe(0)

    // Test insert with same id
    c.insert({ id: 1, name: 'strawberry' })
    expect(() => c.insert({ id: 1, name: 'apple' })).toThrow()

    // Test updateMany with no match
    expect(c.updateMany({ id: 100 }, { $set: { name: 'new name' } })).toBe(0)

    // Test removeMany with no match
    expect(c.removeMany({ id: 100 })).toBe(0)

    // Test removeOne with no match
    expect(c.removeOne({ id: 100 })).toBe(0)
  })
})
