import { vi, describe, it, expect } from 'vitest'
import { autorun } from 'mobx'
import { Collection } from '@signaldb/core'
import mobxReactivityAdapter from '../src'

describe('@signaldb/mobx', () => {
  it('should be reactive with MobX', async () => {
    const reactivity = mobxReactivityAdapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
    reactivity.onDispose = vi.fn(reactivity.onDispose!)

    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const stop = autorun(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
    stop()
  })
})
