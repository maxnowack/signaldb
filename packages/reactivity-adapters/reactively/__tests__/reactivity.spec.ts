import { vi, describe, it, expect } from 'vitest'
import { reactive } from '@reactively/core'
import { Collection } from '@signaldb/core'
import reactivelyReactivityAdapter from '../src'

describe('@signaldb/reactively', () => {
  it('should be reactive with reactively', async () => {
    const reactivity = reactivelyReactivityAdapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
    reactivity.onDispose = vi.fn(reactivity.onDispose!)
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const exec = reactive(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    exec.get()
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    exec.get()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
