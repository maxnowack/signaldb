import type Dependency from '../types/Dependency'
import type Signal from '../types/Signal'

export default function createSignal<T>(
  dependency: Dependency | undefined,
  initialValue: T,
  isEqual: (a: T, b: T) => boolean = Object.is,
) {
  let value = initialValue
  const signal: Signal<T> = {
    get() {
      if (dependency) dependency.depend()
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
