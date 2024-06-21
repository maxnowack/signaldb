import {
  shallowRef,
  triggerRef,
  onScopeDispose,
} from 'vue'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for Vue. See https://signaldb.js.org/reactivity/vue/ for more information.
 */
export const vueReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = shallowRef(0)
    return {
      depend: () => {
        // eslint-disable-next-line no-unused-expressions
        dep.value
      },
      notify: () => {
        triggerRef(dep)
      },
    }
  },
  onDispose: (callback) => {
    onScopeDispose(callback)
  },
  isInScope: undefined,
})

export default vueReactivityAdapter
