import { signal, peek, onDispose, getScope } from '@maverick-js/signals'
import { createReactivityAdapter } from 'signaldb'

const reactivity = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep.set(peek(() => dep() + 1))
      },
    }
  },
  isInScope: () => !!getScope(),
  onDispose: (callback) => {
    onDispose(callback)
  },
})

export default reactivity
