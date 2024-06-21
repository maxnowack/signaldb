import { signal } from '@preact/signals-core'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for Preact. See https://signaldb.js.org/reactivity/preact/ for more information.
 */
export const preactReactivityAdapter = createReactivityAdapter({
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

export default preactReactivityAdapter
