import { describe, it, expect } from 'vitest'
import { Collection } from '../src'
import type { BaseItem, FindOptions } from '../src/Collection'
import type Selector from '../src/types/Selector'

type TestDocument = BaseItem & Record<string, any>

/**
 * Creates strongly typed helper functions for the provided collection.
 * @param collection Collection used for querying.
 * @returns An object with preconfigured helper functions.
 */
function createQueryHelpers(collection: Collection<TestDocument>) {
  const findCursor = (
    selector: Selector<TestDocument> = {},
    options?: FindOptions<TestDocument, true>,
  ) => {
    const normalizedOptions: FindOptions<TestDocument, true> = options
      ? { ...options, async: true }
      : { async: true }
    return collection.find<true>(selector, normalizedOptions)
  }

  const findCount = (
    selector?: Selector<TestDocument>,
    options?: FindOptions<TestDocument, true>,
  ) => findCursor(selector, options).count()

  const fetchLength = async (
    selector?: Selector<TestDocument>,
    options?: FindOptions<TestDocument, true>,
  ) => {
    const cursor = findCursor(selector, options)
    const results = await cursor.fetch()
    return results.length
  }

  const findOneAsync = (
    selector: Selector<TestDocument>,
    options?: FindOptions<TestDocument, true>,
  ) => {
    const normalizedOptions: FindOptions<TestDocument, true> = options
      ? { ...options, async: true }
      : { async: true }
    return collection.findOne<true>(selector, normalizedOptions)
  }

  return {
    findCursor,
    findCount,
    fetchLength,
    findOneAsync,
  }
}

describe('Queries', () => {
  // thanks to https://github.com/meteor/meteor/blob/devel/packages/minimongo/minimongo_tests_client.js
  it('should pass all the basics', async () => {
    const collection = new Collection<TestDocument>()
    const { findCount, fetchLength, findOneAsync } = createQueryHelpers(collection)
    let count

    const fluffyKittenId = await collection.insert({ type: 'kitten', name: 'fluffy' })
    await collection.insert({ type: 'kitten', name: 'snookums' })
    await collection.insert({ type: 'cryptographer', name: 'alice' })
    await collection.insert({ type: 'cryptographer', name: 'bob' })
    await collection.insert({ type: 'cryptographer', name: 'cara' })
    expect(await findCount()).toBe(5)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)
    const fluffyKitten = await findOneAsync({ type: 'kitten', name: 'fluffy' })
    expect(fluffyKitten?.id).toBe(fluffyKittenId)

    await collection.removeMany({ name: 'cara' })
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(2)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(2)

    count = await collection.updateMany({ name: 'snookums' }, { $set: { type: 'cryptographer' } })
    expect(count).toBe(1)
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(1)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(1)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    await expect(() => collection.removeMany(null)).rejects.toThrow()
    // @ts-ignore
    await expect(() => collection.removeMany(false)).rejects.toThrow()
    // @ts-ignore
    await expect(() => collection.removeMany(undefined)).rejects.toThrow()
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    expect(await findCount()).toBe(4)

    await collection.removeOne({ id: null })
    await collection.removeOne({ id: false })
    await collection.removeOne({ id: undefined })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => collection.removeMany()).rejects.toThrow()
    expect(await findCount()).toBe(4)

    count = await collection.removeMany({})
    expect(count).toBe(4)
    expect(await findCount()).toBe(0)

    await collection.insert({ id: 1, name: 'strawberry', tags: ['fruit', 'red', 'squishy'] })
    await collection.insert({ id: 2, name: 'apple', tags: ['fruit', 'red', 'hard'] })
    await collection.insert({ id: 3, name: 'rose', tags: ['flower', 'red', 'squishy'] })

    expect(await findCount({ tags: 'flower' })).toBe(1)
    expect(await findCount({ tags: 'fruit' })).toBe(2)
    expect(await findCount({ tags: 'red' })).toBe(3)
    expect(await fetchLength({ tags: 'flower' })).toBe(1)
    expect(await fetchLength({ tags: 'fruit' })).toBe(2)
    expect(await fetchLength({ tags: 'red' })).toBe(3)

    const strawberry = await findOneAsync({ id: 1 })
    const apple = await findOneAsync({ id: 2 })
    const rose = await findOneAsync({ id: 3 })
    expect(strawberry?.name).toBe('strawberry')
    expect(apple?.name).toBe('apple')
    expect(rose?.name).toBe('rose')
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

    await collection.insert({ foo: { bar: 'baz' } })
    expect(await findCount({ foo: { bam: 'baz' } })).toBe(0)
    expect(await findCount({ foo: { bar: 'baz' } })).toBe(1)
  })

  it('should pass all the basics with indices', async () => {
    const collection = new Collection<TestDocument>({
      indices: ['type'],
    })
    const { findCount, fetchLength, findOneAsync } = createQueryHelpers(collection)
    let count

    const fluffyKittenId = await collection.insert({ type: 'kitten', name: 'fluffy' })
    await collection.insert({ type: 'kitten', name: 'snookums' })
    await collection.insert({ type: 'cryptographer', name: 'alice' })
    await collection.insert({ type: 'cryptographer', name: 'bob' })
    await collection.insert({ type: 'cryptographer', name: 'cara' })
    expect(await findCount()).toBe(5)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)
    const fluffyKitten = await findOneAsync({ type: 'kitten', name: 'fluffy' })
    expect(fluffyKitten?.id).toBe(fluffyKittenId)

    await collection.removeMany({ name: 'cara' })
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(2)
    expect(await findCount({ type: 'cryptographer' })).toBe(2)
    expect(await fetchLength({ type: 'kitten' })).toBe(2)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(2)

    count = await collection.updateMany({ name: 'snookums' }, { $set: { type: 'cryptographer' } })
    expect(count).toBe(1)
    expect(await findCount()).toBe(4)
    expect(await findCount({ type: 'kitten' })).toBe(1)
    expect(await findCount({ type: 'cryptographer' })).toBe(3)
    expect(await fetchLength({ type: 'kitten' })).toBe(1)
    expect(await fetchLength({ type: 'cryptographer' })).toBe(3)

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    await expect(() => collection.removeMany(null)).rejects.toThrow()
    // @ts-ignore
    await expect(() => collection.removeMany(false)).rejects.toThrow()
    // @ts-ignore
    await expect(() => collection.removeMany(undefined)).rejects.toThrow()
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    expect(await findCount()).toBe(4)

    await collection.removeOne({ id: null })
    await collection.removeOne({ id: false })
    await collection.removeOne({ id: undefined })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(() => collection.removeMany()).rejects.toThrow()
    expect(await findCount()).toBe(4)

    count = await collection.removeMany({})
    expect(count).toBe(4)
    expect(await findCount()).toBe(0)

    await collection.insert({ id: 1, name: 'strawberry', tags: ['fruit', 'red', 'squishy'] })
    await collection.insert({ id: 2, name: 'apple', tags: ['fruit', 'red', 'hard'] })
    await collection.insert({ id: 3, name: 'rose', tags: ['flower', 'red', 'squishy'] })

    expect(await findCount({ tags: 'flower' })).toBe(1)
    expect(await findCount({ tags: 'fruit' })).toBe(2)
    expect(await findCount({ tags: 'red' })).toBe(3)
    expect(await fetchLength({ tags: 'flower' })).toBe(1)
    expect(await fetchLength({ tags: 'fruit' })).toBe(2)
    expect(await fetchLength({ tags: 'red' })).toBe(3)

    const indexedStrawberry = await findOneAsync({ id: 1 })
    const indexedApple = await findOneAsync({ id: 2 })
    const indexedRose = await findOneAsync({ id: 3 })
    expect(indexedStrawberry?.name).toBe('strawberry')
    expect(indexedApple?.name).toBe('apple')
    expect(indexedRose?.name).toBe('rose')
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

    await collection.insert({ foo: { bar: 'baz' } })
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
    const collection = new Collection<TestDocument>()
    const { findCount } = createQueryHelpers(collection)

    // Test insert, find, updateMany, removeMany, removeOne with empty data
    expect(await collection.insert({})).toBeDefined()
    expect(await findCount()).toBe(1)
    expect(await collection.updateMany({}, { $set: { name: 'empty' } })).toBe(1)
    expect(await collection.removeMany({})).toBe(1)
    expect(await collection.removeOne({})).toBe(0)

    // Test insert with same id
    await collection.insert({ id: 1, name: 'strawberry' })
    await expect(() => collection.insert({ id: 1, name: 'apple' })).rejects.toThrow()

    // Test updateMany with no match
    expect(await collection.updateMany({ id: 100 }, { $set: { name: 'new name' } })).toBe(0)

    // Test removeMany with no match
    expect(await collection.removeMany({ id: 100 })).toBe(0)

    // Test removeOne with no match
    expect(await collection.removeOne({ id: 100 })).toBe(0)
  })

  it('should handle queries for empty values correctly', async () => {
    const collection = new Collection<TestDocument>({ indices: ['name'] })
    await collection.insert({ id: 1, name: 'John' })
    await collection.insert({ id: 2, name: null })
    await collection.insert({ id: 3, name: undefined })
    await collection.insert({ id: 4, name: '' })
    await collection.insert({ id: 5, name: 0 })
    await collection.insert({ id: 6, name: false })
    await collection.insert({ id: 7, name: [] })
    await collection.insert({ id: 8, name: {} })
    await collection.insert({ id: 9 })

    const { findCount } = createQueryHelpers(collection)

    expect(await findCount({ name: null })).toBe(3)
    expect(await findCount({ name: undefined })).toBe(3)
    expect(await findCount({ name: '' })).toBe(1)
    expect(await findCount({ name: 0 })).toBe(1)
    expect(await findCount({ name: false })).toBe(1)
    expect(await findCount({ name: [] })).toBe(1)
    expect(await findCount({ name: {} })).toBe(1)
    expect(await findCount({ name: { $exists: false } })).toBe(2)
    expect(await findCount({ name: { $exists: true } })).toBe(7)
  })
})
