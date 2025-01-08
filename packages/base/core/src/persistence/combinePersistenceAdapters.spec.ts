import { vi, it, describe, expect, beforeAll } from 'vitest'
import combinePersistenceAdapters, { createTemporaryFallbackExecutor } from './combinePersistenceAdapters'

describe('createTemporaryFallbackExecutor', () => {
  beforeAll(() => {
    vi.useFakeTimers()
  })

  it('should resolve with the result of the first promise function', async () => {
    const firstResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
      return 'First Promise Result'
    })
    const secondResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
      return 'Second Promise Result'
    })

    const executor = createTemporaryFallbackExecutor(
      firstResolvingPromiseFn,
      secondResolvingPromiseFn,
    )
    const resultPromise = executor()

    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise).resolves.toBe('First Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(1)
  })

  it('should call onResolve', async () => {
    const firstResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
      return 'First Promise Result'
    })
    const secondResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
      return 'Second Promise Result'
    })
    const onResolve = vi.fn()

    const executor = createTemporaryFallbackExecutor(
      firstResolvingPromiseFn,
      secondResolvingPromiseFn,
      { onResolve },
    )
    const resultPromise = executor()

    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise).resolves.toBe('First Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(100)
    expect(onResolve).toHaveBeenCalledTimes(1)
  })

  it('should resolve with the result of the second promise function after it finished', async () => {
    const firstResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
      return 'First Promise Result'
    })
    const secondResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
      return 'Second Promise Result'
    })

    const executor = createTemporaryFallbackExecutor(
      firstResolvingPromiseFn,
      secondResolvingPromiseFn,
    )
    const resultPromise1 = executor()

    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise1).resolves.toBe('First Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    const resultPromise2 = executor()

    await expect(resultPromise2).resolves.toBe('Second Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(1)
  })

  it('should clear the result after the specified timeout', async () => {
    const firstResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
      return 'First Promise Result'
    })
    const secondResolvingPromiseFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
      return 'Second Promise Result'
    })

    const executor = createTemporaryFallbackExecutor(
      firstResolvingPromiseFn,
      secondResolvingPromiseFn,
      { cacheTimeout: 100 },
    )
    const resultPromise1 = executor()

    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise1).resolves.toBe('First Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    const resultPromise2 = executor()

    await expect(resultPromise2).resolves.toBe('Second Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(1)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    const resultPromise3 = executor()
    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise3).resolves.toBe('First Promise Result')
    expect(firstResolvingPromiseFn).toHaveBeenCalledTimes(2)
    expect(secondResolvingPromiseFn).toHaveBeenCalledTimes(2)
  })
})

describe('combinePersistenceAdapters', () => {
  beforeAll(() => {
    vi.useFakeTimers()
  })

  it('should register both adapters', async () => {
    const primary = {
      register: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
    }
    const secondary = {
      register: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
    }

    const adapter = combinePersistenceAdapters(primary, secondary)
    await adapter.register(vi.fn())

    expect(primary.register).toHaveBeenCalledTimes(1)
    expect(secondary.register).toHaveBeenCalledTimes(1)
  })

  it('should save to both adapters', async () => {
    const primary = {
      register: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
    }
    const secondary = {
      register: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
    }

    const adapter = combinePersistenceAdapters(primary, secondary)
    await adapter.save([], { added: [], modified: [], removed: [] })

    expect(primary.save).toHaveBeenCalledTimes(1)
    expect(secondary.save).toHaveBeenCalledTimes(1)
  })

  it('should load from the secondary adapter if the read preference is secondary', async () => {
    const onChange = vi.fn()
    const primary = {
      register: vi.fn(),
      load: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 200)
        })
        return 'Primary Load Result'
      }),
      save: vi.fn(),
    }
    const secondary = {
      register: vi.fn(),
      load: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 100)
        })
        return 'Secondary Load Result'
      }),
      save: vi.fn(),
    }

    const adapter = combinePersistenceAdapters(primary, secondary)
    await adapter.register(onChange)
    const result = adapter.load()
    expect(primary.load).toHaveBeenCalledTimes(1)
    expect(secondary.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe('Secondary Load Result')

    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).toHaveBeenCalledTimes(1)

    const result2 = adapter.load()
    expect(primary.load).toHaveBeenCalledTimes(1)
    expect(secondary.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await expect(result2).resolves.toBe('Primary Load Result')

    await vi.advanceTimersByTimeAsync(200) // wait for the cache to expire
    const result3 = adapter.load()
    expect(primary.load).toHaveBeenCalledTimes(2)
    expect(secondary.load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    await expect(result3).resolves.toBe('Secondary Load Result')
  })

  it('should load from the primary adapter if the read preference is primary', async () => {
    const onChange = vi.fn()
    const primary = {
      register: vi.fn(),
      load: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 100)
        })
        return 'Primary Load Result'
      }),
      save: vi.fn(),
    }
    const secondary = {
      register: vi.fn(),
      load: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 200)
        })
        return 'Secondary Load Result'
      }),
      save: vi.fn(),
    }

    const adapter = combinePersistenceAdapters(secondary, primary)
    await adapter.register(onChange)
    const result = adapter.load()
    expect(primary.load).toHaveBeenCalledTimes(1)
    expect(secondary.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe('Primary Load Result')

    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).toHaveBeenCalledTimes(1)

    const result2 = adapter.load()
    expect(primary.load).toHaveBeenCalledTimes(1)
    expect(secondary.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await expect(result2).resolves.toBe('Secondary Load Result')

    await vi.advanceTimersByTimeAsync(200) // wait for the cache to expire
    const result3 = adapter.load()
    expect(primary.load).toHaveBeenCalledTimes(2)
    expect(secondary.load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    await expect(result3).resolves.toBe('Primary Load Result')
  })
})
