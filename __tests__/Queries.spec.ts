import Collection from 'Collection'

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
    expect(fluffyKittenId).toBe(c.findOne({ type: 'kitten', name: 'fluffy' }).id)

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
    c.removeMany(null)
    // @ts-ignore
    c.removeMany(false)
    // @ts-ignore
    c.removeMany(undefined)
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    expect(c.find().count()).toBe(4)

    c.removeOne({ id: null })
    c.removeOne({ id: false })
    c.removeOne({ id: undefined })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    count = c.removeMany()
    expect(count).toBe(0)
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

    expect(c.findOne({ id: 1 }).name).toBe('strawberry')
    expect(c.findOne({ id: 2 }).name).toBe('apple')
    expect(c.findOne({ id: 3 }).name).toBe('rose')
    expect(c.findOne({ id: 4 })).toBe(undefined)
    expect(c.findOne({ id: 'abc' })).toBe(undefined)
    expect(c.findOne({ id: undefined })).toBe(undefined)

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
})
