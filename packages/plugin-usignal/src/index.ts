import { signal } from 'usignal'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for usignal. See https://signaldb.js.org/reactivity/usignal/ for more information.
 */
export const usignalReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        // eslint-disable-next-line no-unused-expressions
        dep.value
      },
      notify: () => {
        dep.value = dep.peek() + 1
      },
    }
  },
  isInScope: undefined,
  onDispose: undefined,
})

export default usignalReactivityAdapter
