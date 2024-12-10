import { vi, describe, it, expect } from 'vitest'
import {
  watchEffect,
  nextTick,
  effectScope,
} from 'vue'
import { Collection } from '@signaldb/core'
import vueReactivityAdapter from '../src'

describe('@signaldb/vue', () => {
  it('should be reactive with Vue.js', async () => {
    const reactivity = vueReactivityAdapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
    reactivity.onDispose = vi.fn(reactivity.onDispose!)
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
    })
    await nextTick()
    collection.insert({ id: '1', name: 'John' })
    await nextTick()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(callback).toHaveBeenLastCalledWith(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
