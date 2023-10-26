import { vi, describe, it, expect } from 'vitest'
import S from 's-js'
import { Collection, createReactivityAdapter } from '../../src/index'

describe('S.js', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = S.data(true)
      return {
        depend: () => {
          dep()
        },
        notify: () => {
          dep(true)
        },
      }
    },
    onDispose: vi.fn((callback) => {
      S.cleanup(callback)
    }),
  })

  it('should be reactive with S.js', () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    S(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    collection.insert({ id: '1', name: 'John' })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
