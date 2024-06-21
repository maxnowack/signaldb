import S from 's-js'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for S.js. See https://signaldb.js.org/reactivity/S/ for more information.
 */
export const sReactivityAdapter = createReactivityAdapter({
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
  isInScope: undefined,
  onDispose: (callback) => {
    S.cleanup(callback)
  },
})

export default sReactivityAdapter
