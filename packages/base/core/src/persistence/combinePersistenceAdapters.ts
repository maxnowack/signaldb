import type PersistenceAdapter from '../types/PersistenceAdapter'
import createPersistenceAdapter from './createPersistenceAdapter'

/**
 * Creates a function that executes two asynchronous functions sequentially.
 * The first function is tried first, and if it resolves, its value is used.
 * If the first function fails or a fallback is required, the second function is executed.
 * An optional cache mechanism can store the result temporarily to improve performance.
 * @template Args - The argument types for the promise functions.
 * @template ReturnVal - The return value type of the promise functions.
 * @param firstResolvingPromiseFn - The primary promise-based function to execute.
 * @param secondResolvingPromiseFn - The secondary fallback promise-based function to execute.
 * @param [options] - Optional configuration.
 * @param [options.onResolve] - Callback executed when a promise resolves.
 * @param [options.cacheTimeout] - Time (in ms) to cache the resolved result.
 * @returns A function that executes the two promises as described.
 */
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

/**
 * Combines two persistence adapters (fast and slow) into a single interface.
 * The fast adapter is used for quick read and write operations, while the slow adapter
 * ensures data persistence and durability. The adapters sync automatically on read and save operations.
 * @template T - The type of the persisted data items.
 * @template I - The type of the identifier for persisted data items.
 * @param slowAdapter - The slow persistence adapter for long-term storage.
 * @param fastAdapter - The fast persistence adapter for quick access.
 * @returns A combined persistence adapter that manages synchronization between the two adapters.
 */
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
