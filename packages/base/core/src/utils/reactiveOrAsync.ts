export type MaybePromise<T> = T | Promise<T>

/**
 * Options that control execution mode (and potential future mode-specific behavior).
 * Keep this minimal; you can extend it later (e.g. signal, timeoutMs, debugLabel).
 */
export type ModeOptions = {
  async?: boolean,
}

/**
 * A generator helper that makes TypeScript infer the “synchronous value type” for maybe-async expressions.
 *
 * Usage:
 *   const doc = yield* unwrap(Collection.findOne(...))
 *   const list = yield* unwrap(Collection.find(...).fetch())
 *
 * Runtime note:
 *   This does not “unwrap” Promises by itself. It yields the value/Promise to the runner and returns the
 *   value that the runner feeds back via `.next(...)`.
 * @param value The value (or Promise of a value) to yield to the runner.
 * @returns A generator that yields `value` and resolves to the runner-supplied unwrapped `T`.
 */
export function unwrap<T>(value: MaybePromise<T>): Generator<MaybePromise<T>, T, T> {
  return (function* () {
    return yield value
  })()
}

/**
 * Internal: checks for thenables (Promise-like).
 * @param value The value to test.
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
 * @param thisArgument The `this` value to bind when invoking `gen`.
 * @param mode Execution mode options.
 * @param gen The generator workflow to run.
 * @returns The workflow result (a plain value in sync mode, or a Promise in async mode).
 */
function runReactiveOrAsync<TThis, TReturn, TNext>(
  thisArgument: TThis,
  mode: ModeOptions | undefined,
  gen: (this: TThis, a: boolean) => Generator<MaybePromise<TNext>, TReturn, TNext>,
): TReturn | Promise<TReturn> {
  const a = !!mode?.async
  const it = gen.call(thisArgument, a)

  if (!a) {
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
 * Generator shape used by the factory.
 *
 * `TThis` is the type of `this` inside the generator.
 * `Args` are the method parameters (excluding the mode flag).
 * `TReturn` is the final return value of the workflow.
 * `TNext` is the type that is yielded/awaited and fed back via `.next(...)`.
 *
 * Note:
 * - For best inference at yield sites, prefer `yield* unwrap(expr)` for maybe-async expressions.
 */
export type ReactiveOrAsyncGen<TThis, Arguments extends any[], TReturn, TNext>
  = (this: TThis, a: boolean, ...args: Arguments) => Generator<MaybePromise<TNext>, TReturn, TNext>

// Type utilities to infer pieces from a generator function type
// type ThisOf<G> = G extends (this: infer TThis, ...args: any[]) => any ? TThis : unknown
// type AllParametersOf<G> = G extends (this: any, ...args: infer P) => any ? P : never
// type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never
// type ArgumentsOf<G> = Tail<Tail<AllParametersOf<G>>> // drop `a` and keep the rest
// type ReturnOfGen<G> = G extends (this: any, ...args: any[]) =>
// Generator<any, infer R, any> ? R : never

/**
 * The method type produced from the generator signature.
 * Adds overloads so that `{ async: true }` yields a `Promise<...>` return type.
 */
export type ReactiveOrAsyncMethod<TThis, P extends any[], R, N> = {
  (this: TThis, ...args: P): R,
  (this: TThis, ...args: [...P, ModeOptions?]): MaybePromise<R>,
  (this: TThis, ...args: [...P, { async: true }]): Promise<R>,
} & {
  /** Exposes the underlying generator for composition via `yield* method.generator.call(this, a, ...)` */
  generator: (this: TThis, a: boolean, ...args: P) => Generator<MaybePromise<N>, R, N>,
}

/**
 * Factory that turns a generator workflow into a callable method that can run in sync (reactive) or async mode.
 *
 * Call style:
 *   fn(a, b)                        -> sync/reactive return
 *   await fn(a, b, { async: true }) -> async return
 * @param gen Generator workflow. Receives `(a)` which indicates async mode and should `yield`/`yield* unwrap(...)`
 *   any values that may be Promises.
 * @returns A callable method with overloads plus a `.generator` property for composition.
 */
export default function reactiveOrAsync<TThis, P extends any[], R, N>(
  gen: (this: TThis, a: boolean, ...args: P) => Generator<MaybePromise<N>, R, N>,
): ReactiveOrAsyncMethod<TThis, P, R, N> {
  /**
   * The generated method wrapper.
   * @param allArguments Method arguments, optionally ending with a `ModeOptions` object.
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

    return runReactiveOrAsync(this, mode, function* (a) {
      return yield* gen.call(this, a, ...parameters)
    })
  }

  method.generator = gen
  return method as unknown as ReactiveOrAsyncMethod<TThis, P, R, N>
}
