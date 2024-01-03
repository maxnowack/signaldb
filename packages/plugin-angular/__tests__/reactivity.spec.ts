import { vi, describe, it, expect } from 'vitest'
import { effect } from '@angular/core'
import { Collection } from 'signaldb'
import angularReactivityAdapter from '../src'

describe('angular', () => {
  it('should be reactive with angular signals', () => {
    const collection = new Collection({ reactivity: angularReactivityAdapter })
    const callback = vi.fn()
    const cleanup = vi.fn()

    effect((onCleanup) => {
      const cursor = collection.find({ name: 'John' })
      callback(cursor.count())
      onCleanup(() => {
        cleanup()
        cursor.cleanup()
      })
    })
    collection.insert({ id: '1', name: 'John' })
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })
})
