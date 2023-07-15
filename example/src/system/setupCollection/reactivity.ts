import { signal, peek, onDispose } from '@maverick-js/signals'
import type { ReactivityAdapter } from 'signaldb'

const reactivity: ReactivityAdapter = {
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
  onDispose: (callback) => {
    onDispose(callback)
  },
}

export default reactivity
