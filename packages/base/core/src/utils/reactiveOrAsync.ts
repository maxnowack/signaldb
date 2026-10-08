/**
 * A value, or a promise of it.
 * @template T - The type of the value.
 */
export type MaybePromise<T> = T | Promise<T>

/**
 * The trailing argument of a method created with `reactiveOrAsync` that selects its execution
 * mode.
 */
export type ModeOptions = {
  /**
  `true` runs the method asynchronously and makes it return a promise.
   */
  async?: boolean,
}

/**
 * A generator helper that makes TypeScript infer the “synchronous value type” for maybe-async
 * expressions inside a `reactiveOrAsync` workflow.
 *
 * Usage:
 *   const doc = yield* unwrap(collection.findOne(...))
 *   const list = yield* unwrap(collection.find(...).fetch())
 *
 * Runtime note:
 *   This does not “unwrap” Promises by itself. It yields the value/Promise to the runner and returns the
 *   value that the runner feeds back via `.next(...)`.
 * @template T - The type of the value.
 * @param value - The value (or Promise of a value) to yield to the runner.
 * @returns A generator that yields `value` and resolves to the runner-supplied unwrapped `T`.
 */
export function unwrap<T>(value: MaybePromise<T>): Generator<MaybePromise<T>, T, T> {
  return (function* () {
    return yield value
  })()
}

/**
 * Internal: checks for thenables (Promise-like).
 * @param value - The value to test.
 * @returns `true` if `value` looks like a Promise/thenable.
 */
function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as any).then === 'function'
}

/**
 * Internal runner: executes a generator either synchronously (reactive) or asynchronously (imperative).
 *
 * - In sync mode, yielding a Promise is a programming error and throws.
 * - In async mode, yielded Promises are awaited.
 * @param thisArgument - The `this` value to bind when invoking `gen`.
 * @param mode - Execution mode options.
 * @param gen - The generator workflow to run.
 * @returns The workflow result (a plain value in sync mode, or a Promise in async mode).
 */
function runReactiveOrAsync<TThis, TReturn, TNext>(
  thisArgument: TThis,
  mode: ModeOptions | undefined,
  gen: (this: TThis, isAsync: boolean) => Generator<MaybePromise<TNext>, TReturn, TNext>,
): TReturn | Promise<TReturn> {
  const isA = !!mode?.async
  const it = gen.call(thisArgument, isA)

  if (!isA) {
    let step = it.next()
    while (!step.done) {
      const y = step.value
      if (isThenable(y)) throw new Error('Promise yielded in sync flow')
      step = it.next(y)
    }
    return step.value
  }

  return (async function () {
    let step = it.next()
    while (!step.done) {
      const y = step.value
      const v: TNext = isThenable(y) ? await y : y
      step = it.next(v)
    }
    return step.value
  })()
}

/* -------------------------------------------------------------------------------------------------
 * Factory: create a method that supports both call styles
 *
 *   fn(a, b)                        -> sync/reactive return
 *   await fn(a, b, { async: true }) -> async return
 *
 * The method’s parameter types and return type are inferred from the generator you pass in.
 * ------------------------------------------------------------------------------------------------- */

/**
 * Generator shape used by the factory. Its first parameter is `true` in async mode.
 * @template TThis - The type of `this` inside the generator.
 * @template Arguments - The method parameters (excluding the mode options).
 * @template TReturn - The final return value of the workflow.
 * @template TNext - The type that is yielded/awaited and fed back via `.next(...)`.
 *
 * Note:
 * - For best inference at yield sites, prefer `yield* unwrap(expr)` for maybe-async expressions.
 */
export type ReactiveOrAsyncGen<TThis, Arguments extends any[], TReturn, TNext>
  = (this: TThis, isAsync: boolean, ...args: Arguments)
  => Generator<MaybePromise<TNext>, TReturn, TNext>

// Type utilities to infer pieces from a generator function type
// type ThisOf<G> = G extends (this: infer TThis, ...args: any[]) => any ? TThis : unknown
// type AllParametersOf<G> = G extends (this: any, ...args: infer P) => any ? P : never
// type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never
// type ArgumentsOf<G> = Tail<Tail<AllParametersOf<G>>> // drop `isAsync` and keep the rest
// type ReturnOfGen<G> = G extends (this: any, ...args: any[]) =>
// Generator<any, infer R, any> ? R : never

/**
 * The method type produced from the generator signature.
 * Adds overloads so that `{ async: true }` yields a `Promise<...>` return type.
 * @template TThis - The type of `this` inside the method.
 * @template P - The method parameters (excluding the mode options).
 * @template R - The result of the workflow.
 * @template N - The type that is yielded/awaited inside the workflow.
 */
export type ReactiveOrAsyncMethod<TThis, P extends any[], R, N> = {
  (this: TThis, ...args: P): R,
  (this: TThis, ...args: [...P, ModeOptions?]): MaybePromise<R>,
  (this: TThis, ...args: [...P, { async: true }]): Promise<R>,
} & {
  /**
  Exposes the underlying generator for composition via `yield* method.generator.call(this, isAsync, ...)`
   */
  generator: (this: TThis, isAsync: boolean, ...args: P) => Generator<MaybePromise<N>, R, N>,
}

/**
 * Factory that turns a generator workflow into a callable method that can run in sync (reactive) or async mode.
 *
 * Call style:
 *   fn(a, b)                        -> sync/reactive return
 *   await fn(a, b, { async: true }) -> async return
 *
 * The mode is read from the last argument if it is an object with an `async` key. In sync mode,
 * yielding a promise throws `Promise yielded in sync flow`; in async mode, yielded promises are
 * awaited.
 * @template TThis - The type of `this` inside the method.
 * @template P - The method parameters (excluding the mode options).
 * @template R - The result of the workflow.
 * @template N - The type that is yielded/awaited inside the workflow.
 * @param gen - Generator workflow. Receives `(isAsync)` which indicates async mode and should
 *   `yield`/`yield* unwrap(...)` any values that may be Promises.
 * @returns A callable method with overloads plus a `.generator` property for composition.
 */
export default function reactiveOrAsync<TThis, P extends any[], R, N>(
  gen: (this: TThis, isAsync: boolean, ...args: P) => Generator<MaybePromise<N>, R, N>,
): ReactiveOrAsyncMethod<TThis, P, R, N> {
  /**
   * The generated method wrapper.
   * @param allArguments - Method arguments, optionally ending with a `ModeOptions` object.
   * @returns The workflow result (sync) or a Promise of the result (async).
   */
  function method(this: TThis, ...allArguments: any[]): any {
    const last = allArguments.length > 0 ? allArguments.at(-1) : undefined
    const hasMode
      = typeof last === 'object'
        && last !== null
        && 'async' in (last)

    const mode: ModeOptions | undefined = hasMode ? (last as ModeOptions) : undefined
    const parameters = (hasMode ? allArguments.slice(0, -1) : allArguments) as unknown as P

    return runReactiveOrAsync(this, mode, function* (this: TThis, isAsync: boolean) {
      return yield* gen.call(this, isAsync, ...parameters)
    })
  }

  method.generator = gen
  return method
}
