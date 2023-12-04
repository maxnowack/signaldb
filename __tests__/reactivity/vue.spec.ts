import { vi, describe, it, expect } from 'vitest'
import {
  shallowRef as vueShallowRef,
  triggerRef as vueTriggerRef,
  watchEffect as vueWatchEffect,
  onScopeDispose as vueOnScopeDispose,
  // getCurrentScope as vueGetCurrentScope,
  nextTick as vueNextTick,
  effectScope as vueEffectScope,
} from 'vue'
import { Collection, createReactivityAdapter } from 'signaldb'

describe('Vue.js', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = vueShallowRef(0)
      return {
        depend: () => {
          // eslint-disable-next-line no-unused-expressions
          dep.value
        },
        notify: () => {
          vueTriggerRef(dep)
        },
      }
    },
    onDispose: vi.fn((callback) => {
      vueOnScopeDispose(callback)
    }),
    // isInScope: () => !!vueGetCurrentScope(), // doesn't work properly
  })

  it('should be reactive with Vue.js', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const scope = vueEffectScope()
    scope.run(() => {
      vueWatchEffect(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
    })
    await vueNextTick()
    collection.insert({ id: '1', name: 'John' })
    await vueNextTick()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(callback).toHaveBeenLastCalledWith(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
