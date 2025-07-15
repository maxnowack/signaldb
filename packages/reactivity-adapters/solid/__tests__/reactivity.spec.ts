import { vi, describe, it, expect } from 'vitest'
import {
  createEffect,
  createRoot,
} from 'solid-js'
import { Collection } from '@signaldb/core'
import solidReactivityAdapter from '../src'

vi.mock('solid-js', async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const solidBrowser = await import('solid-js/dist/solid.js')
  return solidBrowser
})

describe('@signaldb/solid', () => {
  it('should be reactive with solid', async () => {
    const reactivity = solidReactivityAdapter
    const originalOnDispose = reactivity.onDispose
    const dispose = vi.fn()
    reactivity.onDispose = (callback, dependency) => {
      if (!originalOnDispose) return
      dispose.mockImplementation(callback)
      originalOnDispose(dispose, dependency)
    }
    const callback = vi.fn()
    const collection = new Collection({ reactivity })
    createRoot(() => {
      const cursor = collection.find({ name: 'John' })
      createEffect(() => {
        const c = cursor.count()
        callback(c)
      })
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    await collection.insert({ id: '1', name: 'John' })

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
