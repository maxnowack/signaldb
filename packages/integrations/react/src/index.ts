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
 * @param effectFunction - A function that runs a reactive computation and provides a way to stop the computation.
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
export function createUseReactivityHook(effectFunction: ReactiveEffect) {
  /**
   * Custom hook for managing reactive computations.
   * @param reactiveFunction - A function that returns the reactive data.
   * @param deps - Dependency list for the effect.
   * @returns The reactive data.
   */
  function useReactivity<T>(
    reactiveFunction: () => T,
    deps?: DependencyList,
  ): T {
    const forceUpdate = useForceUpdate()
    const refs = useRef<{
      data?: T,
      stopComputation?: StopComputation,
      isComponentMounted: boolean,
      hasInitialRender: boolean,
    }>({
      isComponentMounted: true,
      hasInitialRender: false,
    })

    const ensureComputation = () => {
      if (refs.current.stopComputation) {
        refs.current.stopComputation()
        refs.current.stopComputation = undefined
      }
      refs.current.stopComputation = effectFunction(() => {
        if (!refs.current.isComponentMounted) return
        refs.current.data = reactiveFunction()
        if (!refs.current.hasInitialRender) return
        forceUpdate()
      })
    }

    useMemo(() => {
      if (!refs.current.isComponentMounted) return
      ensureComputation()
    }, deps || [])

    useEffect(() => {
      refs.current.isComponentMounted = true
      refs.current.hasInitialRender = true
      if (!refs.current.stopComputation) ensureComputation()
      return () => {
        refs.current.isComponentMounted = false
        if (!refs.current.stopComputation) return
        refs.current.stopComputation()
        refs.current.stopComputation = undefined
      }
    }, [])
    return refs.current.data as T
  }
  return useReactivity
}
