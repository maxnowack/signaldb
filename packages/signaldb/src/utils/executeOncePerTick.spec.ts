import { vi, it, expect } from 'vitest'
import executeOncePerTick from './executeOncePerTick'

it('should execute the callback once per tick', () => {
  vi.useFakeTimers()

  const callback = vi.fn()
  const execute = executeOncePerTick(callback)

  execute()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(1)

  // Advance the timers to the next tick
  vi.runAllTimers()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(1)
})

it('should schedule the callback for next tick', () => {
  vi.useFakeTimers()

  const callback = vi.fn()
  const execute = executeOncePerTick(callback, true)

  execute()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(0)

  // Advance the timers to the next tick
  vi.runAllTimers()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(1)
})

it('should execute the callback multiple times if executeNextTick is set', () => {
  vi.useFakeTimers()

  const callback = vi.fn()
  const execute = executeOncePerTick(callback)

  // Call execute multiple times within the same tick
  execute()
  execute()
  execute()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(1)

  // Advance the timers to the next tick
  vi.runAllTimers()

  // The callback should be executed twice
  expect(callback).toHaveBeenCalledTimes(2)
})

it('should execute the callback again after multiple calls', () => {
  vi.useFakeTimers()

  const callback = vi.fn()
  const execute = executeOncePerTick(callback)

  // Call execute multiple times within the same tick
  execute()
  execute()
  execute()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(1)

  // Advance the timers to the next tick
  vi.runAllTimers()

  execute()

  // The callback should only be executed once
  expect(callback).toHaveBeenCalledTimes(2)

  // Advance the timers to the next tick
  vi.runAllTimers()

  execute()
  execute()
  execute()
  execute()

  // The callback should be executed three times
  expect(callback).toHaveBeenCalledTimes(3)

  // Advance the timers to the next tick
  vi.runAllTimers()
  vi.runAllTimers()
  vi.runAllTimers()
  vi.runAllTimers()

  execute()

  // The callback should be executed four times
  expect(callback).toHaveBeenCalledTimes(4)
})
