import { vi, describe, it, expect } from 'vitest'
import {
  signal,
  tick,
  peek,
  effect,
  getScope,
  onDispose,
} from '@maverick-js/signals'
import { Collection, createReactivityAdapter } from '../../src/index'

describe('@maverick-js/signals', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = signal(0)
      return {
        depend: () => {
          dep()
        },
        notify: () => {
          dep.set(peek(() => dep() + 1))
        },
      }
    },
    isInScope: () => !!getScope(),
    onDispose: vi.fn((callback) => {
      onDispose(callback)
    }),
  })

  it('should be reactive with @maverick-js/signals', () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    effect(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    tick()
    collection.insert({ id: '1', name: 'John' })
    tick()
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
