import { Tracker } from 'meteor-ts-tracker'
import Collection from 'Collection'
import trackerReactivity from 'trackerReactivity'

describe('Reactivity', () => {
  it('should be reactive', () => {
    const collection = new Collection({
      reactivity: trackerReactivity(),
    })
    const callback = jest.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    Tracker.flush()
    collection.insert({ id: '1', name: 'John' })
    Tracker.flush()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })

  it('should allow overriding reactivity primitives for query', () => {
    const collection = new Collection()
    const callback = jest.fn()

    Tracker.autorun(() => {
      callback(collection.find({ name: 'John' }, {
        reactive: trackerReactivity(),
      }).count())
    })
    Tracker.flush()
    collection.insert({ id: '1', name: 'John' })
    Tracker.flush()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
