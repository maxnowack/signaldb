import { createReactivityAdapter } from '@signaldb/core'
import { createSignal, getOwner, onCleanup } from 'solid-js'

const solidReactivityAdapter = createReactivityAdapter({
  create: () => {
    const [depend, rerun] = createSignal(undefined, { equals: false })
    return {
      depend: () => {
        depend()
      },
      notify: () => {
        rerun()
      },
    }
  },
  isInScope: () => !!getOwner(),
  onDispose: (callback) => {
    onCleanup(callback)
  },
})

export default solidReactivityAdapter
