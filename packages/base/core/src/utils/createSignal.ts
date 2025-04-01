import type ReactivityAdapter from '../types/ReactivityAdapter'
import type Signal from '../types/Signal'

/**
 * Creates a reactive signal for managing state and triggering dependencies.
 * The signal holds a value and provides methods to get and set the value,
 * with optional equality checks and dependency tracking.
 * @template T - The type of the value held by the signal.
 * @param reactivityAdapter - An optional reactivity adapter for managing dependencies.
 * @param initialValue - The initial value of the signal.
 * @param isEqual - A custom equality function to determine if the new value is different
 *   from the current value (default is `Object.is`).
 * @returns A signal object with `get` and `set` methods to manage the value.
 */
export default function createSignal<T>(
  reactivityAdapter: ReactivityAdapter | undefined,
  initialValue: T,
  isEqual: (a: T, b: T) => boolean = Object.is,
) {
  let value = initialValue
  const dependency = reactivityAdapter?.create()
  const isInReactiveScope = () => {
    if (!reactivityAdapter?.isInScope) return true
    return reactivityAdapter.isInScope()
  }
  const signal: Signal<T> = {
    get() {
      if (dependency && isInReactiveScope()) dependency.depend()
      return value
    },
    set(newValue) {
      if (isEqual(value, newValue)) return
      value = newValue
      if (dependency) dependency.notify()
    },
  }
  return signal
}
