// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest'
import {
  createSignal,
  createEffect,
  onCleanup,
  createRoot,
} from 'solid-js/dist/solid'
import { Collection, createReactivityAdapter } from '../../src/index'

describe('solid', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const [depend, rerun] = createSignal(undefined, { equals: false })
      return {
        depend: () => {
          depend()
        },
        notify: () => {
          rerun()
        },
      }
    },
    onDispose: (callback) => {
      onCleanup(callback)
    },
  })

  it('should be reactive with solid', async () => {
    const callback = vi.fn()
    const collection = new Collection({ reactivity })
    createRoot(() => {
      const cursor = collection.find({ name: 'John' })
      createEffect(() => {
        const c = cursor.count()
        callback(c)
      })
    })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    collection.insert({ id: '1', name: 'John' })

    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
