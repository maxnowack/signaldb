import type PersistenceAdapter from '../types/PersistenceAdapter'
import createPersistenceAdapter from './createPersistenceAdapter'

export function createTemporaryFallbackExecutor<Args extends Array<any>, ReturnVal>(
  firstResolvingPromiseFn: (...args: Args) => Promise<ReturnVal>,
  secondResolvingPromiseFn: (...args: Args) => Promise<ReturnVal>,
  options?: {
    onResolve?: () => void,
    cacheTimeout?: number,
  },
): (...args: Args) => Promise<ReturnVal> {
  const cacheTimeout = options?.cacheTimeout ?? 0
  let isResolved = false
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
            secondaryPromise = null
          }, cacheTimeout)
        }
        isResolved = true
        if (options?.onResolve) options.onResolve()
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
  primary: PersistenceAdapter<T, I>,
  secondary: PersistenceAdapter<T, I>,
  options?: {
    readPreference?: 'primary' | 'secondary',
  },
) {
  const readPreference = options?.readPreference ?? 'secondary'
  const primaryAdapter = readPreference === 'primary' ? primary : secondary
  const secondaryAdapter = readPreference === 'primary' ? secondary : primary
  let handleChange: (() => void | Promise<void>) | null = null
  const readExecutor = createTemporaryFallbackExecutor(
    () => primaryAdapter.load(),
    () => secondaryAdapter.load(),
    {
      cacheTimeout: 100,
      onResolve: () => {
        if (!handleChange) return
        void handleChange()
      },
    },
  )
  return createPersistenceAdapter<T, I>({
    async register(onChange) {
      handleChange = onChange
      await Promise.all([primary.register(onChange), secondary.register(onChange)])
    },
    async load() {
      const promise = readExecutor()
      return promise
    },
    async save(items, changes) {
      await Promise.all([
        primaryAdapter.save(items, changes),
        secondaryAdapter.save(items, changes),
      ])
    },
  })
}
