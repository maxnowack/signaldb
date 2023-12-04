import { signal } from '@preact/signals-core'
import { createReactivityAdapter } from 'signaldb'

const preactReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        // eslint-disable-next-line no-unused-expressions
        dep.value
      },
      notify: () => {
        dep.value = dep.peek() + 1
      },
    }
  },
  isInScope: undefined,
  onDispose: undefined,
})

export default preactReactivityAdapter
