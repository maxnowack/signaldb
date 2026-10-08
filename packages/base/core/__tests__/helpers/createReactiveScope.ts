import { createReactivityAdapter } from '../../src'

/**
 * Creates a reactivity adapter together with a way to read inside its scope, for specs that check
 * what a live query publishes. A synchronous read belongs in a reactive scope; this one is open
 * only for the duration of the read and disposes every dependency the read registered when it
 * ends, so nothing outlives the read.
 * @returns The adapter to give a collection, and `read` to run a read inside its scope.
 */
export default function createReactiveScope() {
  let disposers: (() => void)[] | undefined
  const reactivity = createReactivityAdapter({
    create: () => ({ depend: () => {}, notify: () => {} }),
    isInScope: () => disposers !== undefined,
    onDispose: (dispose) => {
      disposers?.push(dispose)
    },
  })

  /**
   * Runs a read inside the reactive scope.
   * @param callback - The read.
   * @returns What the read returned.
   */
  const read = <T>(callback: () => T): T => {
    const ownDisposers: (() => void)[] = []
    disposers = ownDisposers
    try {
      return callback()
    } finally {
      disposers = undefined
      for (const dispose of ownDisposers) dispose()
    }
  }

  return { reactivity, read }
}
