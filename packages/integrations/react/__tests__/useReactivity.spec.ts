// @vitest-environment happy-dom
import { vi, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { signal, onDispose, effect } from '@maverick-js/signals'
import { StrictMode } from 'react'
import { createUseReactivityHook } from '../src'

/**
 * Helper function to create a reactive signal.
 * @param initialValue - The initial value of the signal.
 * @returns An object with get and set methods to interact with the signal.
 */
function reactiveHelper<T>(initialValue: T) {
  const dep = signal(initialValue)
  return {
    get: () => dep(),
    set: (value: T) => {
      dep.set(value)
    },
  }
}

const useReactivity = createUseReactivityHook(effect)

it('should run once without reactive data', async () => {
  const fn = vi.fn().mockResolvedValue('test')
  const { result } = renderHook(() => useReactivity(fn))
  await waitFor(async () => expect(await result.current).toBe('test'))
  expect(fn).toBeCalledTimes(1)
})

it('should rerun with reactive data', async () => {
  const reactive = reactiveHelper(1)
  const dispose = vi.fn()
  const fn = vi.fn().mockImplementation(() => {
    onDispose(dispose)
    return reactive.get()
  })
  const { result, unmount } = renderHook(() => useReactivity(fn))
  await waitFor(async () => expect(await result.current).toBe(1))
  expect(fn).toBeCalledTimes(1)

  reactive.set(2)
  await waitFor(async () => expect(await result.current).toBe(2))
  expect(fn).toBeCalledTimes(2)
  expect(dispose).toBeCalledTimes(1)
  unmount()
  expect(dispose).toBeCalledTimes(2)
})

it('should rerun in strict mode', async () => {
  const reactive = reactiveHelper(1)
  const dispose = vi.fn()
  const fn = vi.fn().mockImplementation(() => {
    onDispose(dispose)
    return reactive.get()
  })
  const { result, unmount } = renderHook(() => useReactivity(fn), {
    wrapper: StrictMode as React.FC,
  })
  await waitFor(async () => expect(await result.current).toBe(1))
  expect(fn).toBeCalledTimes(3)

  reactive.set(2)
  await waitFor(async () => expect(await result.current).toBe(2))
  expect(fn).toBeCalledTimes(4)
  expect(dispose).toBeCalledTimes(3)
  unmount()
  expect(dispose).toBeCalledTimes(4)
})

it('should rerun with reactive data and dependencies', async () => {
  const reactive = reactiveHelper(1)
  const dispose = vi.fn()
  const fn = vi.fn().mockImplementation(() => {
    onDispose(dispose)
    return reactive.get()
  })
  const { result, unmount } = renderHook(props => useReactivity(fn, props), { initialProps: [1] })
  await waitFor(async () => expect(await result.current).toBe(1))
  expect(fn).toBeCalledTimes(1)

  reactive.set(2)
  await waitFor(async () => expect(await result.current).toBe(2))
  expect(fn).toBeCalledTimes(2)
  expect(dispose).toBeCalledTimes(1)
  unmount()
  expect(dispose).toBeCalledTimes(2)
})

it('should rerun if dependencies change', async () => {
  const reactive = reactiveHelper(1)
  const dispose = vi.fn()
  const fn = vi.fn().mockImplementation(() => {
    onDispose(dispose)
    return reactive.get()
  })
  const { result, rerender, unmount } = renderHook(dep =>
    useReactivity(fn, [dep]), { initialProps: 1 })
  await waitFor(async () => expect(await result.current).toBe(1))
  expect(fn).toBeCalledTimes(1)

  rerender(2)
  await waitFor(() => expect(fn).toBeCalledTimes(2))
  expect(fn).toBeCalledTimes(2)
  expect(dispose).toBeCalledTimes(1)
  unmount()
  expect(dispose).toBeCalledTimes(2)
})

it('should not rerun if dependencies do not change', async () => {
  const reactive = reactiveHelper(1)
  const dispose = vi.fn()
  const fn = vi.fn().mockImplementation(() => {
    onDispose(dispose)
    return reactive.get()
  })
  const { result, rerender, unmount } = renderHook(dep =>
    useReactivity(fn, [dep]), { initialProps: 1 })
  await waitFor(async () => expect(await result.current).toBe(1))
  expect(fn).toBeCalledTimes(1)

  rerender(1)
  await waitFor(() => expect(fn).toBeCalledTimes(1))
  expect(fn).toBeCalledTimes(1)
  expect(dispose).toBeCalledTimes(0)
  unmount()
  expect(dispose).toBeCalledTimes(1)
})
