type DebounceOptions = {
  leading?: boolean,
  trailing?: boolean,
};

export default function debounce<Args extends any[], T, ThisType>(
  func: (this: ThisType, ...args: Args) => T,
  wait: number,
  options: DebounceOptions = {},
): (...args: Args) => T {
  let timeout: ReturnType<typeof setTimeout> | null
  let result: T | null

  const { leading = false, trailing = true } = options

  function debounced(this: ThisType, ...args: Args) {
    const shouldCallImmediately = leading && !timeout
    const shouldCallTrailing = trailing && !timeout

    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      timeout = null
      if (trailing && !shouldCallImmediately) {
        result = func.apply(this, args)
      }
    }, wait)

    if (shouldCallImmediately) {
      result = func.apply(this, args)
    } else if (!shouldCallTrailing) {
      result = null
    }

    return result as T
  }
  return debounced
}
