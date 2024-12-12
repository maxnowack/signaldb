import { EventEmitter as BaseEventEmitter } from 'events'

/**
 * Extends the `EventEmitter` class from Node.js to provide a strongly-typed
 * event emitter that enforces type safety for events and their corresponding listeners.
 * @template Events - A record where keys represent event names (string or symbol),
 *   and values represent the listener function types for those events.
 */
export default class EventEmitter<
  Events extends Record<string | symbol, any>,
> extends BaseEventEmitter {
  /**
   * Registers a listener for the specified event.
   * @template K - The key of the event in the `Events` record.
   * @param event - The name of the event to listen for.
   * @param listener - The listener function to execute when the event is emitted.
   * @returns The `EventEmitter` instance, allowing for method chaining.
   */
  on<K extends keyof Events>(event: K, listener: Events[K]) {
    super.on(event as string, listener as (...args: any[]) => void)
    return this
  }

  /**
   * Emits the specified event, triggering all registered listeners for that event.
   * @template K - The key of the event in the `Events` record.
   * @param event - The name of the event to emit.
   * @param args - The arguments to pass to the event listeners.
   * @returns A boolean indicating whether any listeners were triggered.
   */
  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    return super.emit(event as string, ...args)
  }
}
