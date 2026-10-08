import { reactive, onCleanup } from '@reactively/core'
import { createReactivityAdapter } from '@signaldb/core'

const maverickjsReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = reactive(0)
    return {
      depend: () => {
        dependency.get()
      },
      notify: () => {
        dependency.set(dependency.value + 1)
      },
    }
  },
  isInScope: undefined,
  onDispose: (callback) => {
    onCleanup(callback)
  },
})

export default maverickjsReactivityAdapter
