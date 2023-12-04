import { reactive, onCleanup } from '@reactively/core'
import { createReactivityAdapter } from 'signaldb'

const maverickjsReactivityAdapter = createReactivityAdapter({
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

export default maverickjsReactivityAdapter
