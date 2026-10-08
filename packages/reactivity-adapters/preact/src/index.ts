import { signal } from '@preact/signals-core'
import { createReactivityAdapter } from '@signaldb/core'

const preactReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = signal(0)
    return {
      depend: () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        dependency.value
      },
      notify: () => {
        dependency.value = dependency.peek() + 1
      },
    }
  },
  isInScope: undefined,
  onDispose: undefined,
})

export default preactReactivityAdapter
