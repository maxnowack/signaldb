import { signal, untracked } from '@angular/core'
import { createReactivityAdapter } from '@signaldb/core'

const angularReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = signal(0)
    return {
      depend: () => {
        dependency()
      },
      notify: () => {
        dependency.set(untracked(() => dependency() + 1))
      },
    }
  },
})

export default angularReactivityAdapter
