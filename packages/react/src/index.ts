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

// eslint-disable-next-line import/prefer-default-export
export function createUseReactivityHook(effect: ReactiveEffect) {
  function useReactivity<T>(
    reactiveFn: () => T,
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

    useMemo(() => {
      if (!refs.current.isMounted) return
      if (refs.current.stopComputation) refs.current.stopComputation()
      refs.current.stopComputation = effect(() => {
        refs.current.data = reactiveFn()
        forceUpdate()
      })
    }, deps || [])

    useEffect(() => {
      refs.current.isMounted = true
      return () => {
        refs.current.isMounted = false
        if (!refs.current.stopComputation) return
        refs.current.stopComputation()
      }
    }, [])
    return refs.current.data as T
  }
  return useReactivity
}
