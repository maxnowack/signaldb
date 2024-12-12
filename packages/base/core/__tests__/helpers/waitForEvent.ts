/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type EventEmitter from 'events'

type EventNames<E extends EventEmitter> = E extends {
  on(event: infer E, listener: (...args: any[]) => void): any,
} ? E : never;

/**
 * Waits for a specific event to be emitted by an EventEmitter, optionally with a timeout.
 * Resolves with the event data when the event is emitted or rejects if the timeout is reached.
 * @template E - The type of the EventEmitter.
 * @template T - The type of the event data.
 * @param emitter - The EventEmitter to listen for the event on.
 * @param event - The name of the event to wait for.
 * @param timeout - An optional timeout in milliseconds. If specified, the promise will reject if the event is not emitted within the timeout period.
 * @returns A promise that resolves with the event data when the event is emitted.
 */
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
