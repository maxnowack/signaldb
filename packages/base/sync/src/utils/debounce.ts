type DebounceOptions = {
  leading?: boolean,
  trailing?: boolean,
}

/**
 * Debounces a function.
 * @param fn Function to debounce
 * @param wait Time to wait before calling the function.
 * @param [options] Debounce options
 * @param [options.leading] Whether to call the function on the leading edge of the wait interval.
 * @param [options.trailing] Whether to call the function on the trailing edge of the wait interval.
 * @returns The debounced function.
 */
export default function debounce<Arguments extends any[], T, ThisType>(
  fn: (this: ThisType, ...args: Arguments) => T,
  wait: number,
  options: DebounceOptions = {},
): (...args: Arguments) => T {
  let timeout: ReturnType<typeof setTimeout> | null
  let result: T | null

  const { leading = false, trailing = true } = options

  /**
   * The debounced function that will be returned.
   * @param this The context to bind the function to.
   * @param args The arguments to pass to the function.
   * @returns The result of the debounced function.
   */
  function debounced(this: ThisType, ...args: Arguments) {
    const shouldCallImmediately = leading && !timeout
    const shouldCallTrailing = trailing && !timeout

    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      timeout = null
      if (trailing && !shouldCallImmediately) {
        result = fn.apply(this, args)
      }
    }, wait)

    if (shouldCallImmediately) {
      result = fn.apply(this, args)
    } else if (!shouldCallTrailing) {
      result = null
    }

    return result as T
  }
  return debounced
}
