import { vi, describe, it, expect } from 'vitest'
import debounce from './debounce'

describe('debounce', () => {
  it('should debounce the function call', () => {
    vi.useFakeTimers()

    const mockFunction = vi.fn()
    const debouncedFunction = debounce(mockFunction, 100)

    debouncedFunction()
    debouncedFunction()
    debouncedFunction()

    expect(mockFunction).not.toBeCalled()

    vi.advanceTimersByTime(100)

    expect(mockFunction).toBeCalledTimes(1)
  })

  it('should call the function immediately if leading option is true', () => {
    vi.useFakeTimers()

    const mockFunction = vi.fn()
    const debouncedFunction = debounce(mockFunction, 100, { leading: true })

    debouncedFunction()

    expect(mockFunction).toBeCalledTimes(1)

    vi.advanceTimersByTime(100)

    expect(mockFunction).toBeCalledTimes(1)
  })

  it('should call the function after the wait time if trailing option is true', () => {
    vi.useFakeTimers()

    const mockFunction = vi.fn()
    const debouncedFunction = debounce(mockFunction, 100, { trailing: true })

    debouncedFunction()
    debouncedFunction()
    debouncedFunction()

    expect(mockFunction).not.toBeCalled()

    vi.advanceTimersByTime(100)

    expect(mockFunction).toBeCalledTimes(1)
  })

  it('should call the function immediately and after the wait time if both leading and trailing options are true', () => {
    vi.useFakeTimers()

    const mockFunction = vi.fn()
    const debouncedFunction = debounce(mockFunction, 100, { leading: true, trailing: true })

    debouncedFunction()
    debouncedFunction()
    debouncedFunction()

    expect(mockFunction).toBeCalledTimes(1)

    vi.advanceTimersByTime(100)

    expect(mockFunction).toBeCalledTimes(2)
  })
})
