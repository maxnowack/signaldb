import { vi, describe, it, expect } from 'vitest'
import { reactive, onCleanup } from '@reactively/core'
import { Collection, createReactivityAdapter } from '../../src'

describe('@reactively/core', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = reactive(0)
      return {
        depend: () => {
          dep.get()
        },
        notify: () => {
          dep.set(dep.value + 1)
        },
      }
    },
    onDispose: vi.fn((callback) => {
      onCleanup(callback)
    }),
  })

  it('should be reactive with reactively', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const exec = reactive(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    exec.get()
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    exec.get()
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
