import { observable, api } from 'sinuous'
import { createReactivityAdapter } from '@signaldb/core'

const sinuousReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = observable(0)
    return {
      depend: () => {
        dependency()
      },
      notify: () => {
        dependency(api.sample(() => dependency()) + 1)
      },
    }
  },
  isInScope: undefined,
  onDispose: (callback) => {
    api.cleanup(callback)
  },
})

export default sinuousReactivityAdapter
