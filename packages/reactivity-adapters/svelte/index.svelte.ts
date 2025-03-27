import { createSubscriber } from 'svelte/reactivity'
import { createReactivityAdapter } from '@signaldb/core'

const svelteReactivityAdapter = createReactivityAdapter({
  create() {
    let update: () => void
    const subscribe = createSubscriber(u => update = u)
    return {
      depend() {
        subscribe()
      },
      notify() {
        update()
      },
    }
  },
  isInScope: () => !!$effect.tracking(),
})

export default svelteReactivityAdapter
