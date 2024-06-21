import { vi, describe, it, expect } from 'vitest'
import type { Watch, WatchCleanupFn } from '@angular/core/primitives/signals'
import { createWatch } from '@angular/core/primitives/signals'
import { Collection } from 'signaldb'
import { angularReactivityAdapter } from '../src'

// borrowed from https://github.com/angular/angular/blob/80f472f9f4c09af33f41f7e8dd656eff0b74d03f/packages/core/test/signals/effect_util.ts
const queue = new Set<Watch>()
function testingEffect(
  effectFn: (onCleanup: (cleanupFn: WatchCleanupFn) => void) => void,
): void {
  const w = createWatch(effectFn, queue.add.bind(queue), true)

  // Effects start dirty.
  w.notify()
}
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

    testingEffect(() => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
    })
    flushEffects()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(0)
    collection.insert({ id: '1', name: 'John' })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    flushEffects()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
