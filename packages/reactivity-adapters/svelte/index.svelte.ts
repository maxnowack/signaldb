import { createSubscriber } from 'svelte/reactivity'
import { createReactivityAdapter } from '@signaldb/core'

export class SvelteDependency {
  #subscribe: () => void
  #update: (() => void) | undefined
  #onDisposeCallbacks: (() => void)[]

  constructor() {
    this.#onDisposeCallbacks = []

    this.#subscribe = createSubscriber((update) => {
      this.#update = update
      return () => this.dispose()
    })
  }

  depend() {
    this.#subscribe()
  }

  notify() {
    // The #update can potentially be undefined because it only becomes
    // available after #subscribe is called for the first time within a scope.
    this.#update?.()
  }

  onDispose(callback: () => void) {
    this.#onDisposeCallbacks.push(callback)
  }

  dispose() {
    this.#onDisposeCallbacks.forEach(callback => callback())
  }
}

const svelteReactivityAdapter = createReactivityAdapter({
  create: () => new SvelteDependency(),
  isInScope: () => $effect.tracking(),
  onDispose(callback, svelteDependency: SvelteDependency) {
    svelteDependency.onDispose(callback)
  },
})

export default svelteReactivityAdapter
