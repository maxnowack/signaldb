import S from 's-js'
import { createReactivityAdapter } from '@signaldb/core'

const sReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = S.data(true)
    return {
      depend: () => {
        dependency()
      },
      notify: () => {
        dependency(true)
      },
    }
  },
  isInScope: undefined,
  onDispose: (callback) => {
    S.cleanup(callback)
  },
})

export default sReactivityAdapter
