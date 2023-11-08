import { vi, describe, it, expect } from 'vitest'
import $oby, {
  effect,
  untrack,
  cleanup,
  owner,
  tick,
} from 'oby'
import { Collection, createReactivityAdapter } from '../../src/index'

describe('oby', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = $oby(0)
      return {
        depend: () => {
          dep()
        },
        notify: () => {
          dep(untrack(() => dep() + 1))
        },
      }
    },
    isInScope: () => !!owner(),
    onDispose: vi.fn((callback) => {
      cleanup(callback)
    }),
  })

  it('should be reactive with oby', async () => {
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
