/**
 * A strongly‑typed EventEmitter using the native EventTarget under the hood.
 */
export default class EventEmitter<
  Events extends Record<string | symbol, any>,
> extends EventTarget {
  private _maxListeners = 100

  /**
   * We store a map of:
   *   eventName => (originalListener => wrappedListener)
   *
   * The "wrappedListener" is the actual function passed to `addEventListener()`.
   */
  private _listenerStore = new Map<
    keyof Events,
    Map<Events[keyof Events], EventListener>
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
  public on<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ): this {
    // Get or create the Map for this particular event name.
    let listenersMap = this._listenerStore.get(eventName)
    if (!listenersMap) {
      listenersMap = new Map()
      this._listenerStore.set(eventName, listenersMap)
    }

    // Wrap the user-supplied listener in an EventListener that
    // unpacks the `detail` array from the CustomEvent.
    const wrappedListener: EventListener = (event: Event) => {
      const customEvent = event as CustomEvent<Parameters<Events[K]>>
      // “detail” is an array of arguments for this event.
      listener(...(customEvent.detail ?? []))
    }

    // Store the mapping of original => wrapped.
    listenersMap.set(listener, wrappedListener)

    // Actually subscribe using the native EventTarget API.
    this.addEventListener(eventName as string, wrappedListener)

    if (listenersMap.size > this._maxListeners) {
      // eslint-disable-next-line no-console
      console.warn(
        `Possible EventEmitter memory leak detected. ${listenersMap.size} ${String(eventName)} listeners added. Use emitter.setMaxListeners() to increase limit.`,
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
  public once<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ): this {
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
  public off<K extends keyof Events>(
    eventName: K,
    listener: Events[K],
  ): this {
    const listenersMap = this._listenerStore.get(eventName)
    if (!listenersMap) return this

    const wrappedListener = listenersMap.get(listener)
    if (wrappedListener) {
      this.removeEventListener(eventName as string, wrappedListener)
      listenersMap.delete(listener)
    }

    // Clean up if there are no more listeners for that event.
    if (listenersMap.size === 0) {
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
   * @returns         A boolean indicating if the event was not cancelled.
   */
  public emit<K extends keyof Events>(eventName: K, ...args: Parameters<Events[K]>): boolean {
    const event = new CustomEvent<Parameters<Events[K]>>(eventName as string, { detail: args })
    // dispatchEvent returns false if an event was cancelled by
    // a listener calling evt.preventDefault().
    return this.dispatchEvent(event)
  }

  /**
   * Returns the array of listener functions currently registered for a given event.
   * @param eventName The event name (key of E).
   * @returns         An array of listener functions.
   */
  public listeners<K extends keyof Events>(
    eventName: K,
  ): Array<(...args: Parameters<Events[K]>) => void> {
    const listenersMap = this._listenerStore.get(eventName)
    if (!listenersMap) return []
    return [...listenersMap.keys()]
  }

  /**
   * Returns the number of listeners for a given event.
   * @param eventName The event name (key of E).
   * @returns         The number of listeners.
   */
  public listenerCount<K extends keyof Events>(eventName: K): number {
    const listenersMap = this._listenerStore.get(eventName)
    return listenersMap ? listenersMap.size : 0
  }

  /**
   * Removes all listeners for a given event, or all events if none is specified.
   * @param eventName Optional. If omitted, clears all events’ listeners.
   * @returns         The emitter instance (for chaining).
   */
  public removeAllListeners<K extends keyof Events>(eventName?: K): this {
    if (eventName === undefined) {
      // Remove listeners for all events
      for (const [eventName_, listenersMap] of this._listenerStore.entries()) {
        for (const wrappedListener of listenersMap.values()) {
          this.removeEventListener(eventName_ as string, wrappedListener)
        }
      }
      this._listenerStore.clear()
    } else {
      const listenersMap = this._listenerStore.get(eventName)
      if (listenersMap) {
        for (const wrappedListener of listenersMap.values()) {
          this.removeEventListener(eventName as string, wrappedListener)
        }
        this._listenerStore.delete(eventName)
      }
    }

    return this
  }
}
