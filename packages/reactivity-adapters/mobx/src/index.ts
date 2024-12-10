import {
  observable,
  runInAction,
  onBecomeUnobserved,
} from 'mobx'
import { createReactivityAdapter } from '@signaldb/core'

const mobxReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = observable({ count: 0 })
    return {
      depend: () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
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
  isInScope: undefined,
  onDispose(callback, { raw: dep }) {
    onBecomeUnobserved(dep, 'count', callback)
  },
})

export default mobxReactivityAdapter
