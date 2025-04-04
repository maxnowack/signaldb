import { createSubscriber } from 'svelte/reactivity'
import { createReactivityAdapter } from '@signaldb/core'

const svelteReactivityAdapter = createReactivityAdapter({
  create() {
    let update: undefined | (() => void)
    let stop: undefined | (() => void)
    const subscribe = createSubscriber((u) => {
      update = u
      return () => {
        if (!stop) return
        stop()
      }
    })
    return {
      depend() {
        subscribe()
      },
      notify() {
        if (!update) return
        update()
      },
      onStop(callback: () => void) {
        stop = callback
      },
    }
  },
  isInScope: () => !!$effect.tracking(),
  onDispose(callback: () => void, { onStop }) {
    onStop(callback)
  },
})

export default svelteReactivityAdapter
