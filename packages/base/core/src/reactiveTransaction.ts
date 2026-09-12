/**
 * A reactive transaction: several writes that belong to one user-visible
 * operation wake every reactive scope **once**, at the end, instead of once per
 * write phase.
 *
 * This is deliberately not what `Collection.batch()` does, and the difference
 * is the point of the module. A batch defers the *query pipeline* — while it is
 * open no cursor requeries at all — which makes it right for a handful of
 * writes issued together and wrong for anything longer: it must stay
 * synchronous and short, because everything reading a collection is frozen for
 * its duration.
 *
 * A reactive transaction holds only the last step, the notification of reactive
 * scopes. Queries keep running, results stay current, observers keep diffing;
 * what waits is the wake-up. That is what makes it safe to hold open across
 * `await`s and across several batches, which is what a real operation looks
 * like: a write batch, then a follower that derives from it, then whatever the
 * follower's result implies. Each of those is its own flush today, so a screen
 * reading all three re-renders three times for one thing the user did.
 *
 * Each held scope is woken exactly once when the outermost transaction ends,
 * whether it completes or throws — a transaction that swallowed its own
 * notifications on failure would leave the UI showing state that is no longer
 * there.
 */

type Notification = () => void

let depth = 0
let held = new Set<Notification>()

/**
 * Whether a reactive transaction is currently open.
 * @returns `true` while notifications are being held.
 */
export function isInReactiveTransaction(): boolean {
  return depth > 0
}

/**
 * Holds one reactive scope's notification until the open transaction ends.
 * Identity decides: the same notifier held twice wakes its scope once.
 * @param notification - The notifier to hold.
 */
export function holdNotification(notification: Notification): void {
  held.add(notification)
}

/**
 * Releases a notifier that will never fire again, so a disposed cursor cannot
 * be woken by a transaction that outlived it.
 * @param notification - The notifier to drop.
 */
export function releaseNotification(notification: Notification): void {
  held.delete(notification)
}

/** Wakes everything held by the transaction that just ended, each exactly once. */
function flush() {
  const pending = held
  held = new Set()
  pending.forEach((notification) => {
    notification()
  })
}

/**
 * @param callback - The operation to run.
 * @returns The callback's return value.
 */
export default function reactiveTransaction<ReturnType>(
  callback: () => Promise<ReturnType>,
): Promise<ReturnType>
/**
 * @param callback - The operation to run.
 * @returns The callback's return value.
 */
export default function reactiveTransaction<ReturnType>(
  callback: () => ReturnType,
): ReturnType
/**
 * Runs a callback as a reactive transaction: every reactive scope that would
 * have been notified while it runs is notified once, after it ends.
 *
 * Nested transactions join the outermost one — unlike a nested `batch`, which
 * is a passthrough, this is a real nesting, so a pipeline can open one without
 * knowing whether its caller already did.
 *
 * Concurrent transactions overlap rather than queue: while any is open,
 * notifications are held, and they are flushed when the last one ends. That is
 * the conservative direction — a scope may be woken later than its own
 * transaction ended, never earlier.
 * @param callback - The operation to run. May be synchronous or asynchronous.
 * @returns The callback's return value, as a promise if the callback returned one.
 * @example
 * await reactiveTransaction(async () => {
 *   await applyCatch()      // writes the log rows
 *   await runFollower()     // derives the counts from them
 * }) // → every screen reading either of them updates once, here
 */
export default function reactiveTransaction<ReturnType>(
  callback: () => ReturnType | Promise<ReturnType>,
): ReturnType | Promise<ReturnType> {
  if (typeof callback !== 'function') throw new TypeError('reactiveTransaction requires a callback')
  depth += 1

  const end = () => {
    depth -= 1
    if (depth === 0) flush()
  }

  let result: ReturnType | Promise<ReturnType>
  try {
    result = callback()
  } catch (error) {
    // A synchronously throwing callback must not leave the depth raised: every
    // notification after it would be held for the rest of the process.
    end()
    throw error
  }

  if (result && typeof (result as Promise<ReturnType>).then === 'function') {
    return (result as Promise<ReturnType>).then(
      (value) => {
        end()
        return value
      },
      (error) => {
        end()
        throw error
      },
    )
  }
  end()
  return result
}

/** Tests only — module state outlives a single test otherwise. */
export function resetReactiveTransactions(): void {
  depth = 0
  held = new Set()
}
