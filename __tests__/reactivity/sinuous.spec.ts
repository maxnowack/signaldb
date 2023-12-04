import { vi, describe, it, expect } from 'vitest'
import {
  observable,
  api,
} from 'sinuous'
import { Collection, createReactivityAdapter } from 'signaldb'

describe('sinuous', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = observable(0)
      return {
        depend: () => {
          dep()
        },
        notify: () => {
          dep(api.sample(() => dep()) + 1)
        },
      }
    },
    onDispose: vi.fn((callback) => {
      api.cleanup(callback)
    }),
  })

  it('should be reactive with sinuous', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    api.subscribe(() => {
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
