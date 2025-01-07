import { useSyncExternalStore } from 'react'

/**
 * Checks if the previous state is different from the current state.
 * @template T - The type of the state object.
 * @param previousState - The previous state.
 * @param currentState - The current state.
 * @returns Returns true if the states are different, otherwise false.
 */
function defaultDidChange<T extends Record<string, any>>(
  previousState: T,
  currentState: T,
) {
  return previousState !== currentState
}

export default class Store<T extends Record<string, any>> {
  private eventTarget = new EventTarget()
  private state: T

  constructor(initialState: T) {
    this.state = initialState
  }

  set(state: T) {
    this.state = state
    this.emitChange()
  }

  patch(patch: Partial<T>) {
    this.state = { ...this.state, ...patch }
    this.emitChange()
  }

  emitChange() {
    setTimeout(() => {
      this.eventTarget.dispatchEvent(new Event('change'))
    }, 10)
  }

  subscribe(onChange: () => void) {
    this.eventTarget.addEventListener('change', onChange)
    return () => this.eventTarget.removeEventListener('change', onChange)
  }

  get() {
    return this.state
  }

  use(): T
  use<U>(
    selector?: (state: T) => U,
    didChange: (previousState: T, currentState: T) => boolean = defaultDidChange<T>,
  ) {
    return useSyncExternalStore(
      (onChange) => {
        if (!selector) return this.subscribe(onChange)
        let previousState = this.get()
        return this.subscribe(() => {
          const currentState = this.get()
          if (!didChange(previousState, currentState)) return
          previousState = currentState
          onChange()
        })
      },
      () => {
        const state = this.get()
        return selector ? selector(state) : state
      },
    )
  }
}
