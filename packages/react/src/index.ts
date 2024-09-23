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
    const ensureComputation = () => {
      if (refs.current.stopComputation) {
        refs.current.stopComputation()
        refs.current.stopComputation = undefined
      }
      refs.current.stopComputation = effect(() => {
        if (!refs.current.isMounted) return
        refs.current.data = reactiveFn()
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
