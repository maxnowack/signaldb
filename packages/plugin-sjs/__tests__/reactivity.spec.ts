import { vi, describe, it, expect } from 'vitest'
import S from 's-js'
import { Collection } from 'signaldb'
import sReactivityAdapter from '../src'

describe('signaldb-plugin-sjs', () => {
  it('should be reactive with S.js', async () => {
    const reactivity = sReactivityAdapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
    reactivity.onDispose = vi.fn(reactivity.onDispose!)
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    S(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
