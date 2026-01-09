/**
 * Example test suite for the EventEmitter class using Vitest.
 *
 * IMPORTANT: This is a single example test file. In your project,
 * make sure to organize tests according to your conventions.
 *
 * Usage:
 *   1. Install vitest (npm install -D vitest).
 *   2. Create a file named "EventEmitter.test.ts" (or similar).
 *   3. Paste this code into that file.
 *   4. Run tests with "npx vitest" or "npm run test" (depending on your setup).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventEmitter from './EventEmitter'

// Example event shape:
interface MyEvents {
  hello: (name: string) => void,
  goodbye: (reason: string) => void,
  noArgsEvent: () => void,
}

describe('EventEmitter', () => {
  let emitter: EventEmitter<MyEvents>

  beforeEach(() => {
    emitter = new EventEmitter<MyEvents>()
  })

  it('should subscribe to an event using on() and call listeners with correct args', () => {
    const helloListener = vi.fn()
    emitter.on('hello', helloListener)

    emitter.emit('hello', 'Alice')
    expect(helloListener).toHaveBeenCalledTimes(1)
    expect(helloListener).toHaveBeenCalledWith('Alice')
  })

  it('should subscribe to an event using addListener() (alias of on())', () => {
    const goodbyeListener = vi.fn()
    emitter.addListener('goodbye', goodbyeListener)

    emitter.emit('goodbye', 'lack of coffee')
    expect(goodbyeListener).toHaveBeenCalledTimes(1)
    expect(goodbyeListener).toHaveBeenCalledWith('lack of coffee')
  })

  it('should handle once() correctly (listener fires only once)', () => {
    const onceListener = vi.fn()
    emitter.once('hello', onceListener)

    emitter.emit('hello', 'Bob')
    emitter.emit('hello', 'Charlie')

    expect(onceListener).toHaveBeenCalledTimes(1)
    expect(onceListener).toHaveBeenCalledWith('Bob')
  })

  it('should be able to remove a listener with off()', () => {
    const helloListener = vi.fn()
    emitter.on('hello', helloListener)
    emitter.emit('hello', 'David')
    expect(helloListener).toHaveBeenCalledTimes(1)

    emitter.off('hello', helloListener)
    // Emitting again should have no effect now.
    emitter.emit('hello', 'Eve')
    expect(helloListener).toHaveBeenCalledTimes(1)
  })

  it('should do nothing if off() is called with an event that has no listeners', () => {
    // Just ensure it does not throw
    expect(() => {
      emitter.off('hello', vi.fn())
    }).not.toThrow()
  })

  it('should do nothing if off() is called on a listener that is not in the store', () => {
    const helloListener = vi.fn()
    // Add a listener
    emitter.on('hello', helloListener)
    // Attempt to remove a different function
    const differentListener = vi.fn()

    expect(() => {
      emitter.off('hello', differentListener)
    }).not.toThrow()

    // Original listener is still in place
    emitter.emit('hello', 'Frank')
    expect(helloListener).toHaveBeenCalledTimes(1)
  })

  it('should remove a listener using removeListener() (alias of off())', () => {
    const goodbyeListener = vi.fn()
    emitter.addListener('goodbye', goodbyeListener)
    emitter.emit('goodbye', 'lack of coffee')
    expect(goodbyeListener).toHaveBeenCalledTimes(1)

    emitter.removeListener('goodbye', goodbyeListener)
    emitter.emit('goodbye', 'lack of coffee again')
    expect(goodbyeListener).toHaveBeenCalledTimes(1)
  })

  it('should return the array of listener functions with listeners()', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    emitter.on('hello', fn1)
    emitter.on('hello', fn2)

    const allListeners = emitter.listeners('hello')
    expect(allListeners).toContain(fn1)
    expect(allListeners).toContain(fn2)
    expect(allListeners.length).toBe(2)
  })

  it('should return an empty array if no listeners exist for a given event', () => {
    const noListeners = emitter.listeners('goodbye')
    expect(noListeners).toEqual([])
  })

  it('should return the correct listenerCount()', () => {
    expect(emitter.listenerCount('hello')).toBe(0)

    const fn = vi.fn()
    emitter.on('hello', fn)
    expect(emitter.listenerCount('hello')).toBe(1)

    emitter.off('hello', fn)
    expect(emitter.listenerCount('hello')).toBe(0)
  })

  it('should remove all listeners for a specific event', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    emitter.on('hello', fn1).on('hello', fn2)
    expect(emitter.listenerCount('hello')).toBe(2)

    emitter.removeAllListeners('hello')
    expect(emitter.listenerCount('hello')).toBe(0)
  })

  it('should call off for each listener removed via removeAllListeners(event)', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    const offSpy = vi.spyOn(emitter, 'off')
    emitter.on('hello', fn1).on('hello', fn2)

    emitter.removeAllListeners('hello')

    expect(offSpy).toHaveBeenCalledWith('hello', fn1)
    expect(offSpy).toHaveBeenCalledWith('hello', fn2)
    offSpy.mockRestore()
  })

  it('should remove all listeners for all events when removeAllListeners() is called without an event name', () => {
    const helloListener = vi.fn()
    const goodbyeListener = vi.fn()
    emitter.on('hello', helloListener)
    emitter.on('goodbye', goodbyeListener)
    expect(emitter.listenerCount('hello')).toBe(1)
    expect(emitter.listenerCount('goodbye')).toBe(1)

    emitter.removeAllListeners()
    expect(emitter.listenerCount('hello')).toBe(0)
    expect(emitter.listenerCount('goodbye')).toBe(0)
  })

  it('should emit an event that has no listeners without error', () => {
    // No listeners for "noArgsEvent"
    expect(() => {
      emitter.emit('noArgsEvent')
    }).not.toThrow()
  })

  it('should set the maximum number of listeners using setMaxListeners()', () => {
    emitter.setMaxListeners(10)

    const maxListenersCount = (emitter as any)._maxListeners
    expect(maxListenersCount).toBe(10)
  })

  it('should warn if listeners exceed the default limit of 100', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Add 101 listeners to the same event
    for (let i = 0; i <= 100; i++) {
      emitter.on('hello', () => {})
    }

    expect(warnSpy).toHaveBeenCalledOnce()
    warnSpy.mockRestore()
  })

  it('should respect the custom limit set by setMaxListeners()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    emitter.setMaxListeners(3)
    emitter.on('hello', () => {})
    emitter.on('hello', () => {})
    emitter.on('hello', () => {})
    // We are at the limit, so no warning yet
    expect(warnSpy).not.toHaveBeenCalled()

    // One more listener triggers a warning
    emitter.on('hello', () => {})
    expect(warnSpy).toHaveBeenCalledOnce()

    warnSpy.mockRestore()
  })
})
