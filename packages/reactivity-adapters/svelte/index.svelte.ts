import { createSubscriber } from 'svelte/reactivity'
import { createReactivityAdapter } from '@signaldb/core'

const svelteReactivityAdapter = createReactivityAdapter({
  create() {
    let update: () => void
    let cancel: () => void
    const subscribe = createSubscriber((u) => {
      update = u
      return () => cancel()
    })
    return {
      depend() {
        subscribe()
      },
      notify() {
        if (update) {
          update()
        }
      },
      onStop(callback: () => void) {
        cancel = callback
      },
    }
  },
  isInScope: () => !!$effect.tracking(),
  onDispose(callback: () => void, { onStop }) {
    onStop(callback)
  },
})

export default svelteReactivityAdapter
