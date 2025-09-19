import { describe, it, expect } from 'vitest'
import { Collection } from '../src'

describe('Queries', () => {
  // thanks to https://github.com/meteor/meteor/blob/devel/packages/minimongo/minimongo_tests_client.js
  it('should pass all the basics', async () => {
    const c = new Collection()
    const findCursor = (selector: any = {}, options: any = {}) => c.find<true>(selector, { ...options, async: true } as any)
    const findCount = async (selector: any = {}, options: any = {}) => findCursor(selector, options).count()
    const fetchLength = async (selector: any = {}, options: any = {}) => (await findCursor(selector, options).fetch()).length
    const findOneAsync = (selector: any, options: any = {}) => c.findOne<true>(selector, { ...options, async: true } as any)
    let count

    const fluffyKittenId = await c.insert({ type: 'kitten', name: 'fluffy' })
    await c.insert({ type: 'kitten', name: 'snookums' })
    await c.insert({ type: 'cryptographer', name: 'alice' })
    await c.insert({ type: 'cryptographer', name: 'bob' })
    await c.insert({ type: 'cryptographer', name: 'cara' })
    expect(await findCount()).toBe(5)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)
    expect((await findOneAsync({ type: 'kitten', name: 'fluffy' }))?.id).toBe(fluffyKittenId)

    await c.removeMany({ name: 'cara' })
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(2)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(2)

    count = await c.updateMany({ name: 'snookums' }, { $set: { type: 'cryptographer' } })
    expect(count).toBe(1)
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(1)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(1)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    await expect(() => c.removeMany(null)).rejects.toThrow()
    // @ts-ignore
    await expect(() => c.removeMany(false)).rejects.toThrow()
    // @ts-ignore
    await expect(() => c.removeMany(undefined)).rejects.toThrow()
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    expect(await findCount()).toBe(4)

    await c.removeOne({ id: null })
    await c.removeOne({ id: false })
    await c.removeOne({ id: undefined })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => c.removeMany()).rejects.toThrow()
    expect(await findCount()).toBe(4)

    count = await c.removeMany({})
    expect(count).toBe(4)
    expect(await findCount()).toBe(0)

    await c.insert({ id: 1, name: 'strawberry', tags: ['fruit', 'red', 'squishy'] })
    await c.insert({ id: 2, name: 'apple', tags: ['fruit', 'red', 'hard'] })
    await c.insert({ id: 3, name: 'rose', tags: ['flower', 'red', 'squishy'] })

    expect(await findCount({ tags: 'flower' })).toBe(1)
    expect(await findCount({ tags: 'fruit' })).toBe(2)
    expect(await findCount({ tags: 'red' })).toBe(3)
    expect(await fetchLength({ tags: 'flower' })).toBe(1)
    expect(await fetchLength({ tags: 'fruit' })).toBe(2)
    expect(await fetchLength({ tags: 'red' })).toBe(3)

    expect((await findOneAsync({ id: 1 }))?.name).toBe('strawberry')
    expect((await findOneAsync({ id: 2 }))?.name).toBe('apple')
    expect((await findOneAsync({ id: 3 }))?.name).toBe('rose')
    await expect(findOneAsync({ id: 4 })).resolves.toBeUndefined()
    await expect(findOneAsync({ id: 'abc' })).resolves.toBeUndefined()
    await expect(findOneAsync({ id: undefined })).resolves.toBeUndefined()

    expect(await findCount({ id: 1 })).toBe(1)
    expect(await findCount({ id: 4 })).toBe(0)
    expect(await findCount({ id: 'abc' })).toBe(0)
    expect(await findCount({ id: undefined })).toBe(0)
    expect(await findCount()).toBe(3)
    expect(await findCount({ id: 1 }, { skip: 1 })).toBe(0)
    expect(await findCount({ id: 1 }, { skip: 1 })).toBe(0)
    expect(await findCount({ id: undefined })).toBe(0)
    expect(await findCount({ id: false })).toBe(0)
    expect(await findCount({ id: null })).toBe(0)
    expect(await findCount({ id: '' })).toBe(0)
    expect(await findCount({ id: 0 })).toBe(0)
    expect(await findCount({}, { skip: 1 })).toBe(2)
    expect(await findCount({}, { skip: 2 })).toBe(1)
    expect(await findCount({}, { limit: 2 })).toBe(2)
    expect(await findCount({}, { limit: 1 })).toBe(1)
    expect(await findCount({}, { skip: 1, limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { skip: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { skip: 1, limit: 1 })).toBe(1)
    expect(await findCount({ id: 1 }, { sort: { id: -1 }, skip: 1 })).toBe(0)
    expect(await findCount({}, { sort: { id: -1 }, skip: 1 })).toBe(2)
    expect(await findCount({}, { sort: { id: -1 }, skip: 2 })).toBe(1)
    expect(await findCount({}, { sort: { id: -1 }, limit: 2 })).toBe(2)
    expect(await findCount({}, { sort: { id: -1 }, limit: 1 })).toBe(1)
    expect(await findCount({}, { sort: { id: -1 }, skip: 1, limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { sort: { id: -1 }, skip: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { sort: { id: -1 }, limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { sort: { id: -1 }, skip: 1, limit: 1 })).toBe(1)

    await c.insert({ foo: { bar: 'baz' } })
    expect(await findCount({ foo: { bam: 'baz' } })).toBe(0)
    expect(await findCount({ foo: { bar: 'baz' } })).toBe(1)
  })

  it('should pass all the basics with indices', async () => {
    const c = new Collection({
      indices: ['type'],
    })
    const findCursor = (selector: any = {}, options: any = {}) => c.find<true>(selector, { ...options, async: true } as any)
    const findCount = async (selector: any = {}, options: any = {}) => findCursor(selector, options).count()
    const fetchLength = async (selector: any = {}, options: any = {}) => (await findCursor(selector, options).fetch()).length
    const findOneAsync = (selector: any, options: any = {}) => c.findOne<true>(selector, { ...options, async: true } as any)
    let count

    const fluffyKittenId = await c.insert({ type: 'kitten', name: 'fluffy' })
    await c.insert({ type: 'kitten', name: 'snookums' })
    await c.insert({ type: 'cryptographer', name: 'alice' })
    await c.insert({ type: 'cryptographer', name: 'bob' })
    await c.insert({ type: 'cryptographer', name: 'cara' })
    expect(await findCount()).toBe(5)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)
    expect((await findOneAsync({ type: 'kitten', name: 'fluffy' }))?.id).toBe(fluffyKittenId)

    await c.removeMany({ name: 'cara' })
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(2)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(2)

    count = await c.updateMany({ name: 'snookums' }, { $set: { type: 'cryptographer' } })
    expect(count).toBe(1)
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(1)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(1)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    await expect(() => c.removeMany(null)).rejects.toThrow()
    // @ts-ignore
    await expect(() => c.removeMany(false)).rejects.toThrow()
    // @ts-ignore
    await expect(() => c.removeMany(undefined)).rejects.toThrow()
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    expect(await findCount()).toBe(4)

    await c.removeOne({ id: null })
    await c.removeOne({ id: false })
    await c.removeOne({ id: undefined })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => c.removeMany()).rejects.toThrow()
    expect(await findCount()).toBe(4)

    count = await c.removeMany({})
    expect(count).toBe(4)
    expect(await findCount()).toBe(0)

    await c.insert({ id: 1, name: 'strawberry', tags: ['fruit', 'red', 'squishy'] })
    await c.insert({ id: 2, name: 'apple', tags: ['fruit', 'red', 'hard'] })
    await c.insert({ id: 3, name: 'rose', tags: ['flower', 'red', 'squishy'] })

    expect(await findCount({ tags: 'flower' })).toBe(1)
    expect(await findCount({ tags: 'fruit' })).toBe(2)
    expect(await findCount({ tags: 'red' })).toBe(3)
    expect(await fetchLength({ tags: 'flower' })).toBe(1)
    expect(await fetchLength({ tags: 'fruit' })).toBe(2)
    expect(await fetchLength({ tags: 'red' })).toBe(3)

    expect((await findOneAsync({ id: 1 }))?.name).toBe('strawberry')
    expect((await findOneAsync({ id: 2 }))?.name).toBe('apple')
    expect((await findOneAsync({ id: 3 }))?.name).toBe('rose')
    await expect(findOneAsync({ id: 4 })).resolves.toBeUndefined()
    await expect(findOneAsync({ id: 'abc' })).resolves.toBeUndefined()
    await expect(findOneAsync({ id: undefined })).resolves.toBeUndefined()

    expect(await findCount({ id: 1 })).toBe(1)
    expect(await findCount({ id: 4 })).toBe(0)
    expect(await findCount({ id: 'abc' })).toBe(0)
    expect(await findCount({ id: undefined })).toBe(0)
    expect(await findCount()).toBe(3)
    expect(await findCount({ id: 1 }, { skip: 1 })).toBe(0)
    expect(await findCount({ id: 1 }, { skip: 1 })).toBe(0)
    expect(await findCount({ id: undefined })).toBe(0)
    expect(await findCount({ id: false })).toBe(0)
    expect(await findCount({ id: null })).toBe(0)
    expect(await findCount({ id: '' })).toBe(0)
    expect(await findCount({ id: 0 })).toBe(0)
    expect(await findCount({}, { skip: 1 })).toBe(2)
    expect(await findCount({}, { skip: 2 })).toBe(1)
    expect(await findCount({}, { limit: 2 })).toBe(2)
    expect(await findCount({}, { limit: 1 })).toBe(1)
    expect(await findCount({}, { skip: 1, limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { skip: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { skip: 1, limit: 1 })).toBe(1)
    expect(await findCount({ id: 1 }, { sort: { id: -1 }, skip: 1 })).toBe(0)
    expect(await findCount({}, { sort: { id: -1 }, skip: 1 })).toBe(2)
    expect(await findCount({}, { sort: { id: -1 }, skip: 2 })).toBe(1)
    expect(await findCount({}, { sort: { id: -1 }, limit: 2 })).toBe(2)
    expect(await findCount({}, { sort: { id: -1 }, limit: 1 })).toBe(1)
    expect(await findCount({}, { sort: { id: -1 }, skip: 1, limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { sort: { id: -1 }, skip: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { sort: { id: -1 }, limit: 1 })).toBe(1)
    expect(await findCount({ tags: 'fruit' }, { sort: { id: -1 }, skip: 1, limit: 1 })).toBe(1)

    await c.insert({ foo: { bar: 'baz' } })
    expect(await findCount({ foo: { bam: 'baz' } })).toBe(0)
    expect(await findCount({ foo: { bar: 'baz' } })).toBe(1)
  })

  it('should handle errors', async () => {
    const c = new Collection()

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => c.insert(null)).rejects.toThrow()

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
    await expect(() => c.updateMany({ id: 1 }, null)).rejects.toThrow()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => c.updateMany(null, { $set: { name: 'new name' } })).rejects.toThrow()

    // Test removeOne with invalid data
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => c.removeOne(null)).rejects.toThrow()
  })

  it('should handle edge cases', async () => {
    const c = new Collection()
    const findCursor = (selector: any = {}, options: any = {}) => c.find<true>(selector, { ...options, async: true } as any)

    // Test insert, find, updateMany, removeMany, removeOne with empty data
    expect(await c.insert({})).toBeDefined()
    expect(await findCursor({}).count()).toBe(1)
    expect(await c.updateMany({}, { $set: { name: 'empty' } })).toBe(1)
    expect(await c.removeMany({})).toBe(1)
    expect(await c.removeOne({})).toBe(0)

    // Test insert with same id
    await c.insert({ id: 1, name: 'strawberry' })
    await expect(() => c.insert({ id: 1, name: 'apple' })).rejects.toThrow()

    // Test updateMany with no match
    expect(await c.updateMany({ id: 100 }, { $set: { name: 'new name' } })).toBe(0)

    // Test removeMany with no match
    expect(await c.removeMany({ id: 100 })).toBe(0)

    // Test removeOne with no match
    expect(await c.removeOne({ id: 100 })).toBe(0)
  })

  it('should handle queries for empty values correctly', async () => {
    const c = new Collection({ indices: ['name'] })
    await c.insert({ id: 1, name: 'John' })
    await c.insert({ id: 2, name: null })
    await c.insert({ id: 3, name: undefined })
    await c.insert({ id: 4, name: '' })
    await c.insert({ id: 5, name: 0 })
    await c.insert({ id: 6, name: false })
    await c.insert({ id: 7, name: [] })
    await c.insert({ id: 8, name: {} })
    await c.insert({ id: 9 })

    const findCursor = (selector: any = {}, options: any = {}) => c.find<true>(selector, { ...options, async: true } as any)

    expect(await findCursor({ name: null }).count()).toBe(3)
    expect(await findCursor({ name: undefined }).count()).toBe(3)
    expect(await findCursor({ name: '' }).count()).toBe(1)
    expect(await findCursor({ name: 0 }).count()).toBe(1)
    expect(await findCursor({ name: false }).count()).toBe(1)
    expect(await findCursor({ name: [] }).count()).toBe(1)
    expect(await findCursor({ name: {} }).count()).toBe(1)
    expect(await findCursor({ name: { $exists: false } }).count()).toBe(2)
    expect(await findCursor({ name: { $exists: true } }).count()).toBe(7)
  })
})
