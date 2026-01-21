// reactiveOrAsync.test.ts
import { describe, it, expect } from 'vitest'
import reactiveOrAsync, { type ModeOptions, unwrap } from './reactiveOrAsync'

describe('reactiveOrAsync / unwrap', () => {
  it('unwrap: yields the provided value and returns the runner-fed value', () => {
    const iterator = unwrap(123)

    const s1 = iterator.next()
    expect(s1.done).toBe(false)
    expect(s1.value).toBe(123)

    const s2 = iterator.next(999)
    expect(s2.done).toBe(true)
    expect(s2.value).toBe(999)
  })

  it('sync mode: runs generator synchronously and disallows yielding Promises', () => {
    const context = { base: 10 }

    const fn = reactiveOrAsync<typeof context, [number], number, number>(
      function* (this: typeof context, a: boolean, x: number) {
        // `a` indicates async-mode; should be false here
        if (a) throw new Error('expected sync mode')

        const v1 = yield x
        const v2 = yield* unwrap(v1 + this.base)
        return v2
      },
    )

    // No mode object provided => sync path
    const bound = (x: number, mode?: ModeOptions) => {
      return mode === undefined
        ? (fn as any).call(context, x)
        : (fn as any).call(context, x, mode)
    }
    expect(bound(5)).toBe(15)

    // Still sync, but with an explicit mode object (async: false)
    expect(bound(7, { async: false })).toBe(17)

    // Exposes underlying generator for composition
    expect(typeof fn.generator).toBe('function')
  })

  it('sync mode: throws a helpful error if a thenable/Promise is yielded', () => {
    const fn = reactiveOrAsync<unknown, [], number, number>(function* (this: unknown, a: boolean) {
      void this
      void a
      // In sync mode, yielding a Promise (or thenable) is a programming error.
      const v = yield* unwrap(Promise.resolve(1))
      return v
    })

    expect(() => fn()).toThrowError(new Error('Promise yielded in sync flow'))
  })

  it('async mode: awaits yielded Promises and passes through non-thenables', async () => {
    const context = { base: 3 }

    const fn = reactiveOrAsync<typeof context, [number], number, number>(
      function* (this: typeof context, a: boolean, x: number) {
        if (!a) throw new Error('expected async mode')

        // thenable -> awaited by the runner
        const p = yield* unwrap(Promise.resolve(x + 1)) // -> 5 when x=4

        // plain value -> NOT awaited, just fed back
        const plain = yield p + this.base // -> yield 8
        return plain * 2 // -> 16
      },
    )

    const bound = (x: number, mode: { async: true }) =>
      (fn as any).call(context, x, mode) as Promise<number>
    await expect(bound(4, { async: true })).resolves.toBe(16)
  })

  it('mode detection: a last-arg object without "async" is treated as a normal parameter (including null)', () => {
    const fn = reactiveOrAsync<unknown, [any], any, any>(
      function* (this: unknown, a: boolean, object: any) {
        void this
        void a
        const got = yield object
        return got
      },
    )

    const payload = { foo: 1 } // no "async" key => not a mode object
    expect(fn(payload)).toEqual(payload)

    // null should not be treated as a mode object either
    expect(fn(null)).toBeNull()
  })
})
