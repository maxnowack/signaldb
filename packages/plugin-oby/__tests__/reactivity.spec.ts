import { vi, describe, it, expect } from 'vitest'
import { effect, tick } from 'oby'
import { Collection } from 'signaldb'
import { obyReactivityAdapter } from '../src'

describe('signaldb-plugin-oby', () => {
  it('should be reactive with oby', async () => {
    const reactivity = obyReactivityAdapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
    reactivity.onDispose = vi.fn(reactivity.onDispose!)

    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    effect(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    tick()
    collection.insert({ id: '1', name: 'John' })
    tick()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
