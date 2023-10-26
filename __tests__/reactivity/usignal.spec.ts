import { vi, describe, it, expect } from 'vitest'
import {
  signal,
  effect,
} from 'usignal'
import { Collection, createReactivityAdapter } from '../../src/index'

describe('usignal', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = signal(0)
      return {
        depend: () => {
          // eslint-disable-next-line no-unused-expressions
          dep.value
        },
        notify: () => {
          dep.value = dep.peek() + 1
        },
      }
    },
  })

  it('should be reactive with usignal', () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()
    const cleanup = vi.fn()

    effect(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
      return () => {
        cleanup()
        cursor.cleanup()
      }
    })
    collection.insert({ id: '1', name: 'John' })
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
