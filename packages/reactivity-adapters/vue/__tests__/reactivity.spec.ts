import { vi, describe, it, expect } from 'vitest'
import {
  watchEffect,
  nextTick,
  effectScope,
} from 'vue'
import { Collection } from '../../base/core/src'
import vueReactivityAdapter from '../src'

describe('@signaldb/vue', () => {
  it('should be reactive with Vue.js', async () => {
    const collection = new Collection({ reactivity: vueReactivityAdapter })
    const callback = vi.fn()
    const cleanup = vi.fn()

    const scope = effectScope()
    scope.run(() => {
      watchEffect((onCleanup) => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
        cleanup.mockImplementation(() => cursor.cleanup())
        onCleanup(() => {
          cleanup()
        })
      })
    })
    await nextTick()
    await collection.insert({ id: '1', name: 'John' })
    await nextTick()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(callback).toHaveBeenLastCalledWith(1)
    expect(callback).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
