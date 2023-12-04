import { vi, describe, it, expect } from 'vitest'
import {
  signal,
  tick,
  peek,
  effect,
  getScope,
  onDispose,
} from '@maverick-js/signals'
import { Collection, createReactivityAdapter } from '../../src'

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

  it('should be reactive with @maverick-js/signals', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    effect(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    tick()
    collection.insert({ id: '1', name: 'John' })
    tick()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
