import { createReactivityAdapter } from '../../src'

// The reactivity harness from reactivity.spec.ts, extracted so a second test
// file can ask the only question that matters about notifications: how many
// times did the effect actually re-run.
export const primitiveReactivity = (() => {
  class Computation {
    effectCallback: () => void
    onInvalidateCallbacks: (() => void)[] = []
    constructor(effectCallback: () => void) {
      this.effectCallback = effectCallback
    }

    onInvalidate(callback: () => void) {
      this.onInvalidateCallbacks.push(callback)
    }

    invalidate() {
      this.onInvalidateCallbacks.forEach(callback => callback())
    }
  }

  let currentComputation: Computation | null = null
  let lastComputation: Computation | null = null

  /**
   * Creates a reactive signal with an initial value.
   * @template T
   * @param initialValue - The initial value of the signal.
   * @returns The reactive signal.
   */
  function signal<T>(initialValue: T) {
    let value = initialValue
    const computationDeps = new Set<Computation>()
    const signalValue = () => {
      if (currentComputation) computationDeps.add(currentComputation)
      return value
    }
    signalValue.set = (newValue: T) => {
      value = newValue
      computationDeps.forEach(computation => computation.effectCallback())
    }
    return signalValue
  }
  const effect = (callback: () => void) => {
    const effectCallback = () => {
      if (lastComputation) lastComputation.invalidate()
      currentComputation = new Computation(effectCallback)
      lastComputation = currentComputation
      callback()
      currentComputation = null
    }
    effectCallback()
  }
  /**
   * Temporarily suspends reactivity tracking for the duration of the callback.
   * @param callback - The callback function to execute without reactivity tracking.
   * @returns The result of the callback function.
   */
  function peek<T>(callback: () => T) {
    const previousComputation = currentComputation
    currentComputation = null
    const result = callback()
    currentComputation = previousComputation
    return result
  }
  return {
    effect,
    signal,
    peek,
    getCurrentComputation: () => currentComputation,
  }
})()
export const primitiveReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = primitiveReactivity.signal(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep.set(primitiveReactivity.peek(() => dep() + 1))
      },
    }
  },
  onDispose: (dispose) => {
    primitiveReactivity.getCurrentComputation()?.onInvalidate(dispose)
  },
  isInScope: () => !!primitiveReactivity.getCurrentComputation(),
})
