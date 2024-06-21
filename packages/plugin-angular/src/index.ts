import { signal, untracked } from '@angular/core'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for Angular. See https://signaldb.js.org/reactivity/angular/ for more information.
 */
export const angularReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep.set(untracked(() => dep() + 1))
      },
    }
  },
})

export default angularReactivityAdapter
