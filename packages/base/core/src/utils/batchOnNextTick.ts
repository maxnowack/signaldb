/**
 * Groups multiple calls by key and flushes them on the next tick (macrotask).
 * @param onFlush - Function that will be called with the key and all queued items when flushing.
 * @returns An object with `enqueue` and `flush` methods.
 * @example
 *   const batcher = batchOnNextTick<string>(async (key, items) => {
 *     // items is an array of { args, resolve, reject }
 *     // do something once with all args...
 *   })
 *
 *   batcher.enqueue("my-key", [arg1, arg2])
 */
export default function batchOnNextTick<TKey>(
  onFlush: (key: TKey, items: any[][]) => Promise<any[]>,
) {
  const queues = new Map<TKey, {
    timer: NodeJS.Timeout | null,
    items: {
      args: any[],
      resolve: (value: any) => void,
      reject: (reason?: any) => void,
    }[],
    flush: () => Promise<void>,
  }>()

  /**
   * Enqueue a call with the given key and arguments.
   * @param key key to group calls
   * @param args arguments for the call
   * @returns A promise that resolves or rejects when the call is flushed.
   */
  function enqueue(key: TKey, args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      let q = queues.get(key)
      if (!q) {
        q = {
          timer: null,
          items: [],
          flush: () => flush(key),
        }
        queues.set(key, q)
      }
      q.items.push({ args, resolve, reject })

      if (q.timer == null) {
        q.timer = setTimeout(() => {
          q.timer = null
          void q.flush()
        }, 0)
      }
    })
  }

  /**
   * Flush the queue for the given key immediately.
   * @param key key to flush
   * @returns A promise that resolves when the flush is complete.
   */
  async function flush(key: TKey): Promise<void> {
    const q = queues.get(key)
    if (!q || q.items.length === 0) return
    if (q.timer != null) {
      clearTimeout(q.timer)
      q.timer = null
    }
    const items = q.items.splice(0)
    onFlush(key, items.map(i => i.args))
      .then((results) => {
        for (const [index, result] of results.entries()) {
          const { resolve } = items[index]
          resolve(result)
        }
      })
      .catch((error) => {
        for (const { reject } of items) {
          reject(error)
        }
      })
  }

  return { enqueue, flush }
}
