import { vi, describe, it, expect } from 'vitest'
import {
  observable,
  autorun,
  runInAction,
  onBecomeUnobserved,
} from 'mobx'
import { Collection, createReactivityAdapter } from 'signaldb'

describe('MobX', () => {
  const reactivity = createReactivityAdapter({
    create: () => {
      const dep = observable({ count: 0 })
      return {
        depend: () => {
          // eslint-disable-next-line no-unused-expressions
          dep.count
        },
        notify: () => {
          runInAction(() => {
            dep.count += 1
          })
        },
        raw: dep,
      }
    },
    onDispose(callback, { raw: dep }) {
      onBecomeUnobserved(dep, 'count', callback)
    },
  })

  it('should be reactive with MobX', async () => {
    const collection = new Collection({ reactivity })
    const callback = vi.fn()

    const stop = autorun(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
    stop()
  })
})
