import { it, expect, describe, vi } from 'vitest'
import { EventEmitter } from '../../src'
import waitForEvent from './waitForEvent'

describe('waitForEvent', () => {
  it('should resolve when event is emitted', async () => {
    const emitter = new EventEmitter()
    const promise = waitForEvent(emitter, 'event')
    emitter.emit('event', 1)
    await expect(promise).resolves.toBe(1)
  })

  it('should reject when timeout is reached', async () => {
    const emitter = new EventEmitter()
    vi.useFakeTimers()
    const promise = waitForEvent(emitter, 'event', 10)
    vi.advanceTimersByTime(10)
    await expect(promise).rejects.toThrowError('waitForEvent timeout')
    vi.useRealTimers()
  })

  it('should clear timeout when event resolves earlier', async () => {
    const emitter = new EventEmitter()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const promise = waitForEvent(emitter, 'event', 50)
    emitter.emit('event', 'payload')
    await expect(promise).resolves.toBe('payload')
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
