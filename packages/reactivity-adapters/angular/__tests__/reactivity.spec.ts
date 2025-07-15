import { vi, describe, it, expect } from 'vitest'
import type { Watch, WatchCleanupFn } from '@angular/core/primitives/signals'
import { createWatch } from '@angular/core/primitives/signals'
import { Collection } from '@signaldb/core'
import angularReactivityAdapter from '../src'

// borrowed from https://github.com/angular/angular/blob/80f472f9f4c09af33f41f7e8dd656eff0b74d03f/packages/core/test/signals/effect_util.ts
const queue = new Set<Watch>()
/**
 * Creates and runs a watch effect.
 * @param effectFunction - The effect function to run.
 */
function testingEffect(
  effectFunction: (onCleanup: (cleanupFunction: WatchCleanupFn) => void) => void,
): void {
  const w = createWatch(effectFunction, queue.add.bind(queue), true)

  // Effects start dirty.
  w.notify()
}
/**
 * Flushes and runs all queued effects.
 */
function flushEffects(): void {
  for (const watch of queue) {
    queue.delete(watch)
    watch.cleanup()
    watch.run()
  }
}

describe('angular', () => {
  it('should be reactive with angular signals', async () => {
    const collection = new Collection({ reactivity: angularReactivityAdapter })
    const callback = vi.fn()
    const cleanup = vi.fn()

    testingEffect((onCleanup) => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
      cleanup.mockImplementation(() => cursor.cleanup())
      onCleanup(() => cleanup())
    })
    flushEffects()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(0)
    await collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    flushEffects()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
