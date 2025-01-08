import type { DependencyList } from 'react'
import { useRef, useReducer, useMemo, useEffect } from 'react'

const forceUpdateReducer = (x: number): number => x + 1
const useForceUpdate = () => useReducer(forceUpdateReducer, 0)[1]

interface StopComputation {
  (): void,
}
interface ReactiveEffect {
  (reactiveFunction: () => void): StopComputation,
}

/**
 * Creates a custom React hook for managing reactive computations with a given reactive effect.
 * This hook allows for automatic tracking and re-rendering of React components when reactive dependencies change.
 * @param effect - A function that runs a reactive computation and provides a way to stop the computation.
 * @returns A React hook (`useReactivity`) for managing reactive computations.
 * @example
 * import { createUseReactivityHook } from './createUseReactivityHook';
 *
 * example with @maverick-js/signals effect function
 * import { effect } from @maverick-js/signals
 *
 * // Create the custom hook
 * const useReactivity = createUseReactivityHook(effect);
 *
 * // Use the custom hook in a component
 * function MyComponent() {
 *   const reactiveData = useReactivity(() => {
 *     return myReactiveCollection.find().fetch();
 *   }, []);
 *
 *   return (
 *     <div>
 *       {reactiveData.map(item => (
 *         <div key={item.id}>{item.name}</div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function createUseReactivityHook(effect: ReactiveEffect) {
  function useReactivity<T>(
    reactiveFunction: () => T,
    deps?: DependencyList,
  ): T {
    const forceUpdate = useForceUpdate()
    const refs = useRef<{
      data?: T,
      stopComputation?: StopComputation,
      isMounted: boolean,
    }>({
      isMounted: true,
    })
    const ensureComputation = () => {
      if (refs.current.stopComputation) {
        refs.current.stopComputation()
        refs.current.stopComputation = undefined
      }
      refs.current.stopComputation = effect(() => {
        if (!refs.current.isMounted) return
        refs.current.data = reactiveFunction()
        forceUpdate()
      })
    }

    useMemo(() => {
      if (!refs.current.isMounted) return
      ensureComputation()
    }, deps || [])

    useEffect(() => {
      refs.current.isMounted = true
      if (!refs.current.stopComputation) ensureComputation()
      return () => {
        refs.current.isMounted = false
        if (!refs.current.stopComputation) return
        refs.current.stopComputation()
        refs.current.stopComputation = undefined
      }
    }, [])
    return refs.current.data as T
  }
  return useReactivity
}
