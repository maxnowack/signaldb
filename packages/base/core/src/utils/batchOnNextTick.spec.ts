import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import batchOnNextTick from './batchOnNextTick' // <-- adjust path

describe('batchOnNextTick', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('batches multiple enqueues with the same key into one onFlush call on the next macrotask', async () => {
    const onFlush = vi.fn(async (key: string, items: any[][]) => {
      return items.map(args => ({ key, args }))
    })

    const batcher = batchOnNextTick(onFlush)

    const p1 = batcher.enqueue('A', [1])
    const p2 = batcher.enqueue('A', [2])
    const p3 = batcher.enqueue('B', ['x'])

    expect(onFlush).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(onFlush).toHaveBeenCalledTimes(2)

    const callA = onFlush.mock.calls.find(([key]) => key === 'A')
    expect(callA && callA[1]).toHaveLength(2)
    const callB = onFlush.mock.calls.find(([key]) => key === 'B')
    expect(callB && callB[1]).toHaveLength(1)

    await expect(p1).resolves.toEqual({ key: 'A', args: [1] })
    await expect(p2).resolves.toEqual({ key: 'A', args: [2] })
    await expect(p3).resolves.toEqual({ key: 'B', args: ['x'] })
  })

  it('separate ticks produce separate flushes for the same key', async () => {
    const onFlush = vi.fn(async (_key: string, items: any[][]) => {
      return items.map(([x]) => x)
    })
    const batcher = batchOnNextTick(onFlush)

    const p1 = batcher.enqueue('A', [1])

    // Create assertion promise first, then run timers; await both
    await Promise.all([
      (async () => await expect(p1).resolves.toBe(1))(),
      vi.runAllTimersAsync(),
    ])
    expect(onFlush).toHaveBeenCalledTimes(1)

    const p2 = batcher.enqueue('A', [2])
    await Promise.all([
      (async () => await expect(p2).resolves.toBe(2))(),
      vi.runAllTimersAsync(),
    ])
    expect(onFlush).toHaveBeenCalledTimes(2)
  })

  it('flush(key) triggers immediate flush, cancels pending timer, and does not flush again later', async () => {
    const onFlush = vi.fn(async (_key: string, items: any[][]) => {
      return items.map(([x]) => `ok:${x}`)
    })
    const batcher = batchOnNextTick(onFlush)

    const p1 = batcher.enqueue('A', [1])
    const p2 = batcher.enqueue('A', [2])

    // Attach handlers and flush concurrently; assertions are created first
    await Promise.all([
      (async () => {
        await expect(p1).resolves.toBe('ok:1')
        await expect(p2).resolves.toBe('ok:2')
      })(),
      batcher.flush('A'),
    ])

    expect(onFlush).toHaveBeenCalledTimes(1)
    const [key, items] = onFlush.mock.calls[0]
    expect(key).toBe('A')
    expect(items).toEqual([[1], [2]])

    await vi.runAllTimersAsync()
    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('flush(key) is a no-op for unknown key or empty queue', async () => {
    // Unknown key: no-op
    {
      const onFlush = vi.fn(async () => [])
      const batcher = batchOnNextTick(onFlush)
      await batcher.flush('Z' as any)
      expect(onFlush).not.toHaveBeenCalled()
    }

    // Known key: first flush processes items, second flush is a no-op
    {
      const onFlush = vi.fn(async (_key: string, items: any[][]) => {
        return items.map(() => 'done')
      })
      const batcher = batchOnNextTick(onFlush)

      const p = batcher.enqueue('A', [42])

      await Promise.all([
        (async () => await expect(p).resolves.toBe('done'))(),
        batcher.flush('A'),
      ])
      expect(onFlush).toHaveBeenCalledTimes(1)

      await batcher.flush('A') // queue now empty → no-op
      expect(onFlush).toHaveBeenCalledTimes(1)
    }
  })

  it('propagates onFlush errors by rejecting all pending promises in the batch (scheduled path)', async () => {
    const error = new Error('boom')
    const onFlush = vi.fn(() => Promise.reject(error))
    const batcher = batchOnNextTick(onFlush)

    const p1 = batcher.enqueue('A', [1])
    const p2 = batcher.enqueue('A', [2])

    // Create rejection assertions first, then run timers; await both
    await Promise.all([
      (async () => {
        await expect(p1).rejects.toBe(error)
        await expect(p2).rejects.toBe(error)
      })(),
      vi.runAllTimersAsync(),
    ])
  })

  it('propagates onFlush errors by rejecting all pending promises in the batch (manual flush)', async () => {
    const error = new Error('boom')
    const onFlush = vi.fn(() => Promise.reject(error))
    const batcher = batchOnNextTick(onFlush)

    const p1 = batcher.enqueue('A', [1])
    const p2 = batcher.enqueue('A', [2])

    // Create rejection assertions first, then flush; await both
    await Promise.all([
      (async () => {
        await expect(p1).rejects.toBe(error)
        await expect(p2).rejects.toBe(error)
      })(),
      batcher.flush('A'),
    ])
  })

  it('passes only args arrays to onFlush and maps results by index back to callers', async () => {
    const onFlush = vi.fn(async (_key: string, items: any[][]) => {
      expect(items).toEqual([[3, 'a'], [5, 'b']])
      return items.map(([n, s]) => `${s}:${n * 2}`)
    })
    const batcher = batchOnNextTick(onFlush)

    const p1 = batcher.enqueue('X', [3, 'a'])
    const p2 = batcher.enqueue('X', [5, 'b'])

    await Promise.all([
      (async () => {
        await expect(p1).resolves.toBe('a:6')
        await expect(p2).resolves.toBe('b:10')
      })(),
      vi.runAllTimersAsync(),
    ])
  })
})
