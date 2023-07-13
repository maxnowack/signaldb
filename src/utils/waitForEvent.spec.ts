import EventEmitter from 'events'
import { it, expect, describe } from 'vitest'
import waitForEvent from 'utils/waitForEvent'

describe('waitForEvent', () => {
  it('should resolve when event is emitted', async () => {
    const emitter = new EventEmitter()
    const promise = waitForEvent(emitter, 'event')
    emitter.emit('event', 1)
    await expect(promise).resolves.toBe(1)
  })

  it('should reject when timeout is reached', async () => {
    const emitter = new EventEmitter()
    const promise = waitForEvent(emitter, 'event', 10)
    await expect(promise).rejects.toThrowError('waitForEvent timeout')
  })
})
