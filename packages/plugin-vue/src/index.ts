import {
  shallowRef,
  triggerRef,
  onScopeDispose,
} from 'vue'
import { createReactivityAdapter } from 'signaldb'

const vueReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = shallowRef(0)
    return {
      depend: () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
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
