import {
  signal,
  peek,
  getScope,
  onDispose,
} from '@maverick-js/signals'
import { createReactivityAdapter } from '@signaldb/core'

const maverickjsReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = signal(0)
    return {
      depend: () => {
        dependency()
      },
      notify: () => {
        dependency.set(peek(() => dependency() + 1))
      },
    }
  },
  isInScope: () => !!getScope(),
  onDispose: callback => onDispose(callback),
})

export default maverickjsReactivityAdapter
