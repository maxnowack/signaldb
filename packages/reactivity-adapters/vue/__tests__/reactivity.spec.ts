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

  it('should stay reactive over several writes', async () => {
    const collection = new Collection<{ id: string, name: string }>({
      reactivity: vueReactivityAdapter,
    })
    const seen: number[] = []

    const scope = effectScope()
    scope.run(() => {
      watchEffect((onCleanup) => {
        const cursor = collection.find()
        seen.push(cursor.count())
        onCleanup(() => cursor.cleanup())
      })
    })
    await nextTick()

    for (let index = 0; index < 3; index += 1) {
      await collection.insert({ id: `${index}`, name: `name-${index}` })
      await nextTick()
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }

    // Every rerun cleans its cursor up and observes again. The observation the rerun creates
    // must survive the cleanup of the one it replaced, or the effect stops after the first write.
    expect(seen.at(-1)).toBe(3)
    scope.stop()
  })
})
