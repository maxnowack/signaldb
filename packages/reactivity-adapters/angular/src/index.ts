import { signal, untracked } from '@angular/core'
import { createReactivityAdapter } from '@signaldb/core'

const angularReactivityAdapter = createReactivityAdapter({
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
