import { EventEmitter as BaseEventEmitter } from 'events'

declare interface EventEmitter<T extends Record<string | symbol, any>> {
  on<U extends keyof T>(
    event: U, listener: T[U]
  ): this,

  emit<U extends keyof T>(
    event: U, ...args: Parameters<T[U]>
  ): boolean,
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class EventEmitter<T> extends BaseEventEmitter {}

export default EventEmitter
