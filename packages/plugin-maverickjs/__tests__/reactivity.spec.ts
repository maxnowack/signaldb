import { vi, describe, it, expect } from 'vitest'
import {
  tick,
  effect,
} from '@maverick-js/signals'
import { Collection } from 'signaldb'
import { maverickjsReactivityAdapter } from '../src'

describe('signaldb-plugin-maverickjs', () => {
  it('should be reactive with @maverick-js/signals', async () => {
    const reactivity = maverickjsReactivityAdapter
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
