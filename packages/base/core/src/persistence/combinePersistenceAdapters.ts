import type PersistenceAdapter from '../types/PersistenceAdapter'
import createPersistenceAdapter from './createPersistenceAdapter'

/**
 * Creates a function that executes two asynchronous functions sequentially.
 * The first function is tried first, and if it resolves, its value is used.
 * If the first function fails or a fallback is required, the second function is executed.
 * An optional cache mechanism can store the result temporarily to improve performance.
 * @template Arguments - The argument types for the promise functions.
 * @template ReturnValue - The return value type of the promise functions.
 * @param firstResolvingPromiseFunction - The primary promise-based function to execute.
 * @param secondResolvingPromiseFunction - The secondary fallback promise-based function to execute.
 * @param [options] - Optional configuration.
 * @param [options.onResolve] - Callback executed when a promise resolves.
 * @param [options.cacheTimeout] - Time (in ms) to cache the resolved result.
 * @returns A function that executes the two promises as described.
 */
export function createTemporaryFallbackExecutor<Arguments extends Array<any>, ReturnValue>(
  firstResolvingPromiseFunction: (...args: Arguments) => Promise<ReturnValue>,
  secondResolvingPromiseFunction: (...args: Arguments) => Promise<ReturnValue>,
  options?: {
    onResolve?: (returnValue: ReturnValue) => void,
    cacheTimeout?: number,
  },
): (...args: Arguments) => Promise<ReturnValue> {
  const cacheTimeout = options?.cacheTimeout ?? 0
  let isResolved = false
  let resolvedValue: ReturnValue | null = null
  let timeout: NodeJS.Timeout | null = null
  let secondaryPromise: Promise<ReturnValue> | null = null
  return (...args: Arguments) => {
    if (secondaryPromise == null) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      secondaryPromise = secondResolvingPromiseFunction(...args).then((result) => {
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
    return firstResolvingPromiseFunction(...args)
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
