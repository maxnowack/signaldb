import { vi, describe, it, expect } from 'vitest'
import debounce from './debounce'

describe('debounce', () => {
  it('should debounce the function call', () => {
    vi.useFakeTimers()

    const mockFn = vi.fn()
    const debouncedFn = debounce(mockFn, 100)

    debouncedFn()
    debouncedFn()
    debouncedFn()

    expect(mockFn).not.toBeCalled()

    vi.advanceTimersByTime(100)

    expect(mockFn).toBeCalledTimes(1)
  })

  it('should call the function immediately if leading option is true', () => {
    vi.useFakeTimers()

    const mockFn = vi.fn()
    const debouncedFn = debounce(mockFn, 100, { leading: true })

    debouncedFn()

    expect(mockFn).toBeCalledTimes(1)

    vi.advanceTimersByTime(100)

    expect(mockFn).toBeCalledTimes(1)
  })

  it('should call the function after the wait time if trailing option is true', () => {
    vi.useFakeTimers()

    const mockFn = vi.fn()
    const debouncedFn = debounce(mockFn, 100, { trailing: true })

    debouncedFn()
    debouncedFn()
    debouncedFn()

    expect(mockFn).not.toBeCalled()

    vi.advanceTimersByTime(100)

    expect(mockFn).toBeCalledTimes(1)
  })

  it('should call the function immediately and after the wait time if both leading and trailing options are true', () => {
    vi.useFakeTimers()

    const mockFn = vi.fn()
    const debouncedFn = debounce(mockFn, 100, { leading: true, trailing: true })

    debouncedFn()
    debouncedFn()
    debouncedFn()

    expect(mockFn).toBeCalledTimes(1)

    vi.advanceTimersByTime(100)

    expect(mockFn).toBeCalledTimes(2)
  })
})
