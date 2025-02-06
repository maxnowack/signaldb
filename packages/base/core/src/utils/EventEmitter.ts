/**
 * A strongly‑typed EventEmitter.
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

  public setMaxListeners(max: number): this {
    this._maxListeners = max
    return this
  }

  /**
   * Subscribe to an event with a listener function.
   * @param eventName The event name (key of E).
   * @param listener  A function that receives the emitted arguments.
   * @returns         The emitter instance (for chaining).
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
   * @param eventName The event name (key of E).
   * @param listener  A function that receives the emitted arguments.
   * @returns         The emitter instance (for chaining).
   */
  public addListener<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ) {
    return this.on(eventName, listener)
  }

  /**
   * Subscribe to an event, handling it only once. Automatically removes
   * the listener after it fires the first time.
   * @param eventName The event name (key of E).
   * @param listener  A function that receives the emitted arguments.
   * @returns         The emitter instance (for chaining).
   */
  public once<K extends keyof Events>(eventName: K, listener: Events[K]): this {
    // We define a wrapper that calls the listener once, then unsubscribes itself.
    const onceWrapper = ((...args: Parameters<Events[K]>) => {
      listener(...args)
      this.off(eventName, onceWrapper)
    }) as Events[K]

    // Important: explicitly specify <K> to ensure TS sees the same type param
    return this.on<K>(eventName, onceWrapper)
  }

  /**
   * Unsubscribe a previously subscribed listener.
   * @param eventName The event name (key of E).
   * @param listener  The original function passed to `on` or `once`.
   * @returns         The emitter instance (for chaining).
   */
  public off<K extends keyof Events>(eventName: K, listener: Events[K]): this {
    const listenersSet = this._listenerStore.get(eventName)
    if (!listenersSet) return this

    listenersSet.delete(listener)

    // Clean up if there are no more listeners for that event.
    if (listenersSet.size === 0) {
      this._listenerStore.delete(eventName)
    }

    return this
  }

  /**
   * Unsubscribe a previously subscribed listener.
   * @param eventName The event name (key of E).
   * @param listener  The original function passed to `on` or `once`.
   * @returns         The emitter instance (for chaining).
   */
  public removeListener<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ) {
    return this.off(eventName, listener)
  }

  /**
   * Emit (dispatch) an event with a variable number of arguments.
   * @param eventName The event name (key of E).
   * @param args      The arguments to pass to subscribed listeners.
   */
  public emit<K extends keyof Events>(
    eventName: K,
    ...args: Parameters<Events[K]>
  ): void {
    this.listeners(eventName).forEach((listener) => {
      listener(...args)
    })
  }

  /**
   * Returns the array of listener functions currently registered for a given event.
   * @param eventName The event name (key of E).
   * @returns         An array of listener functions.
   */
  public listeners<K extends keyof Events>(
    eventName: K,
  ): Array<(...args: Parameters<Events[K]>) => void> {
    const listenersSet = this._listenerStore.get(eventName)
    if (!listenersSet) return []
    return [...listenersSet.values()]
  }

  /**
   * Returns the number of listeners for a given event.
   * @param eventName The event name (key of E).
   * @returns         The number of listeners.
   */
  public listenerCount<K extends keyof Events>(eventName: K): number {
    const listenersSet = this._listenerStore.get(eventName)
    return listenersSet ? listenersSet.size : 0
  }

  /**
   * Removes all listeners for a given event, or all events if none is specified.
   * @param eventName Optional. If omitted, clears all events’ listeners.
   * @returns         The emitter instance (for chaining).
   */
  public removeAllListeners<K extends keyof Events>(eventName?: K): this {
    if (eventName === undefined) {
      // Remove listeners for all events
      for (const [eventName_, listenersSet] of this._listenerStore.entries()) {
        for (const listener of listenersSet.values()) {
          this.off(eventName_, listener)
        }
      }
      this._listenerStore.clear()
    } else {
      const listenersSet = this._listenerStore.get(eventName)
      if (listenersSet) {
        for (const listener of listenersSet.values()) {
          this.off(eventName, listener)
        }
        this._listenerStore.delete(eventName)
      }
    }

    return this
  }
}
