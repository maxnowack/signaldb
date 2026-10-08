import {
  shallowRef,
  triggerRef,
} from 'vue'
import { createReactivityAdapter } from '@signaldb/core'

const vueReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = shallowRef(0)
    return {
      depend: () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        dependency.value
      },
      notify: () => {
        triggerRef(dependency)
      },
    }
  },
})

export default vueReactivityAdapter
