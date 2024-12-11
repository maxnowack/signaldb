import type PersistenceAdapter from '../types/PersistenceAdapter'
import createPersistenceAdapter from './createPersistenceAdapter'

export function createTemporaryFallbackExecutor<Args extends Array<any>, ReturnVal>(
  firstResolvingPromiseFn: (...args: Args) => Promise<ReturnVal>,
  secondResolvingPromiseFn: (...args: Args) => Promise<ReturnVal>,
  options?: {
    onResolve?: (returnValue: ReturnVal) => void,
    cacheTimeout?: number,
  },
): (...args: Args) => Promise<ReturnVal> {
  const cacheTimeout = options?.cacheTimeout ?? 0
  let isResolved = false
  let resolvedValue: ReturnVal | null = null
  let timeout: NodeJS.Timeout | null = null
  let secondaryPromise: Promise<ReturnVal> | null = null
  return (...args: Args) => {
    if (secondaryPromise == null) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      secondaryPromise = secondResolvingPromiseFn(...args).then((result) => {
        if (cacheTimeout > 0) {
          timeout = setTimeout(() => {
            isResolved = false
            resolvedValue = null
            secondaryPromise = null
          }, cacheTimeout)
        }
        isResolved = true
        resolvedValue = result
        if (options?.onResolve) options.onResolve(resolvedValue)
        return result
      })
    } else if (isResolved) {
      return secondaryPromise
    }
    return firstResolvingPromiseFn(...args)
  }
}

export default function combinePersistenceAdapters<
  T extends { id: I } & Record<string, any>,
  I,
>(
  slowAdapter: PersistenceAdapter<T, I>,
  fastAdapter: PersistenceAdapter<T, I>,
) {
  let handleChange: (() => void | Promise<void>) | null = null
  const readExecutor = createTemporaryFallbackExecutor(
    () => fastAdapter.load(),
    () => slowAdapter.load(),
    {
      cacheTimeout: 100,
      onResolve: (result) => {
        if (handleChange) void handleChange()
        void fastAdapter.save(result.items || [], {
          added: result.changes?.added || [],
          modified: result.changes?.modified || [],
          removed: result.changes?.removed || [],
        })
      },
    },
  )
  return createPersistenceAdapter<T, I>({
    async register(onChange) {
      handleChange = onChange
      await Promise.all([slowAdapter.register(onChange), fastAdapter.register(onChange)])
    },
    async load() {
      const promise = readExecutor()
      return promise
    },
    async save(items, changes) {
      await Promise.all([
        fastAdapter.save(items, changes),
        slowAdapter.save(items, changes),
      ])
    },
  })
}
