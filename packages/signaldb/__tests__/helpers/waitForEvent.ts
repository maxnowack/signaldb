import type EventEmitter from 'events'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type EventNames<E extends EventEmitter> = E extends {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  on(event: infer E, listener: (...args: any[]) => void): any,
} ? E : never;

export default async function waitForEvent<E extends EventEmitter, T>(
  emitter: E,
  event: EventNames<E>,
  timeout?: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = timeout && setTimeout(() => {
      reject(new Error('waitForEvent timeout'))
    }, timeout)

    emitter.once(event, (value: T) => {
      if (timeoutId) clearTimeout(timeoutId)
      resolve(value)
    })
  })
}
