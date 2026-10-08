import {
  observable,
  runInAction,
  onBecomeUnobserved,
} from 'mobx'
import { createReactivityAdapter } from '@signaldb/core'

const mobxReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = observable({ count: 0 })
    return {
      depend: () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        dependency.count
      },
      notify: () => {
        runInAction(() => {
          dependency.count += 1
        })
      },
      raw: dependency,
    }
  },
  isInScope: undefined,
  onDispose(callback, { raw: dependency }) {
    onBecomeUnobserved(dependency, 'count', callback)
  },
})

export default mobxReactivityAdapter
