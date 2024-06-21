import { reactive, onCleanup } from '@reactively/core'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for Reactively. See https://signaldb.js.org/reactivity/reactively/ for more information.
 */
const reactivelyReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = reactive(0)
    return {
      depend: () => {
        dep.get()
      },
      notify: () => {
        dep.set(dep.value + 1)
      },
    }
  },
  isInScope: undefined,
  onDispose: (callback) => {
    onCleanup(callback)
  },
})

export default reactivelyReactivityAdapter
