import { observable, api } from 'sinuous'
import { createReactivityAdapter } from '@signaldb/core'

const sinuousReactivityAdapter = createReactivityAdapter({
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
  isInScope: undefined,
  onDispose: (callback) => {
    api.cleanup(callback)
  },
})

export default sinuousReactivityAdapter
