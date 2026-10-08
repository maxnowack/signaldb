/**
 * A strongly-typed event emitter, the base class of `Collection`. Listeners are kept in a set
 * per event, so registering the same function twice for one event registers it once.
 * @template Events - Maps each event name to the signature of its listeners.
 */
export default class EventEmitter<Events extends Record<string | symbol, any>> {
  private _maxListeners = 100

  /**
   * We store a set of the listeners for each event.
   */
  private _listenerStore = new Map<
    keyof Events,
    Set<Events[keyof Events]>
  >()

  /**
   * The wrapper `once` registered for each listener, so that `off` can remove it.
   */
  private _onceWrappers = new Map<
    keyof Events,
    Map<Events[keyof Events], Events[keyof Events]>
  >()

  /**
   * Sets how many listeners an event may have before `on` warns about a possible memory leak
   * (default: 100). The warning is only logged; listeners are never rejected.
   * @param max - The number of listeners above which to warn.
   * @returns The emitter instance (for chaining).
   */
  public setMaxListeners(max: number): this {
    this._maxListeners = max
    return this
  }

  /**
   * Subscribe to an event with a listener function.
   * @param eventName - The event name.
   * @param listener - A function that receives the emitted arguments.
   * @returns The emitter instance (for chaining).
   */
  public on<K extends keyof Events>(eventName: K, listener: Events[K]): this {
    // Get or create the Map for this particular event name.
    let listenersSet = this._listenerStore.get(eventName)
    if (!listenersSet) {
      listenersSet = new Set()
      this._listenerStore.set(eventName, listenersSet)
    }

    listenersSet.add(listener)

    if (listenersSet.size > this._maxListeners) {
      // eslint-disable-next-line no-console
      console.warn(
        `Possible EventEmitter memory leak detected. ${
          listenersSet.size
        } ${String(
          eventName,
        )} listeners added. Use emitter.setMaxListeners() to increase limit.`,
      )
    }

    return this
  }

  /**
   * Subscribe to an event with a listener function.
   * @param eventName - The event name.
   * @param listener - A function that receives the emitted arguments.
   * @returns The emitter instance (for chaining).
   */
  public addListener<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ) {
    return this.on(eventName, listener)
  }

  /**
   * Subscribe to an event, handling it only once. Automatically removes
   * the listener after it fires the first time; passing it to `off` before that removes it too.
   * @param eventName - The event name.
   * @param listener - A function that receives the emitted arguments.
   * @returns The emitter instance (for chaining).
   */
  public once<K extends keyof Events>(eventName: K, listener: Events[K]): this {
    // We define a wrapper that calls the listener once, then unsubscribes itself.
    const wrappers = this._onceWrappers.get(eventName)
      ?? new Map<Events[keyof Events], Events[keyof Events]>()
    this._onceWrappers.set(eventName, wrappers)
    const onceWrapper = ((...args: Parameters<Events[K]>) => {
      wrappers.delete(listener)
      this.off(eventName, onceWrapper)
      listener(...args)
    }) as Events[K]
    wrappers.set(listener, onceWrapper)

    // Important: explicitly specify <K> to ensure TS sees the same type param
    return this.on<K>(eventName, onceWrapper)
  }

  /**
   * Unsubscribe a previously subscribed listener.
   * @param eventName - The event name.
   * @param listener - The function passed to `on` or `once`.
   * @returns The emitter instance (for chaining).
   */
  public off<K extends keyof Events>(eventName: K, listener: Events[K]): this {
    const listenersSet = this._listenerStore.get(eventName)
    if (!listenersSet) return this

    const wrappers = this._onceWrappers.get(eventName)
    const onceWrapper = wrappers?.get(listener)
    if (wrappers && onceWrapper) {
      wrappers.delete(listener)
      listenersSet.delete(onceWrapper)
    }
    listenersSet.delete(listener)

    // Clean up if there are no more listeners for that event.
    if (listenersSet.size === 0) {
      this._listenerStore.delete(eventName)
    }

    return this
  }

  /**
   * Unsubscribe a previously subscribed listener.
   * @param eventName - The event name.
   * @param listener - The function passed to `on`.
   * @returns The emitter instance (for chaining).
   */
  public removeListener<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ) {
    return this.off(eventName, listener)
  }

  /**
   * Emit (dispatch) an event with a variable number of arguments. Listeners are called
   * synchronously, in the order they were added.
   * @param eventName - The event name.
   * @param args - The arguments to pass to subscribed listeners.
   */
  public emit<K extends keyof Events>(
    eventName: K,
    ...args: Parameters<Events[K]>
  ): void {
    for (const listener of this.listeners(eventName)) {
      listener(...args)
    }
  }

  /**
   * Returns the array of listener functions currently registered for a given event.
   * @param eventName - The event name.
   * @returns A copy of the listener functions.
   */
  public listeners<K extends keyof Events>(
    eventName: K,
  ): Array<(...args: Parameters<Events[K]>) => void> {
    const listenersSet = this._listenerStore.get(eventName)
    return listenersSet ? [...listenersSet] : []
  }

  /**
   * Returns the number of listeners for a given event.
   * @param eventName - The event name.
   * @returns The number of listeners.
   */
  public listenerCount<K extends keyof Events>(eventName: K): number {
    const listenersSet = this._listenerStore.get(eventName)
    return listenersSet ? listenersSet.size : 0
  }

  /**
   * Removes all listeners for a given event, or all events if none is specified.
   * @param [eventName] - The event name. If omitted, clears all events' listeners.
   * @returns The emitter instance (for chaining).
   */
  public removeAllListeners<K extends keyof Events>(eventName?: K): this {
    if (eventName === undefined) {
      // Remove listeners for all events
      for (const [eventName_, listenersSet] of this._listenerStore) {
        for (const listener of listenersSet) {
          this.off(eventName_, listener)
        }
      }
      this._listenerStore.clear()
    } else {
      const listenersSet = this._listenerStore.get(eventName)
      if (listenersSet) {
        for (const listener of listenersSet) {
          this.off(eventName, listener)
        }
        this._listenerStore.delete(eventName)
      }
    }

    return this
  }
}
