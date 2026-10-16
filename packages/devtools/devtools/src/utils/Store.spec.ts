import { describe, it, expect, vi } from 'vitest'
import Store from './Store'

describe('Store', () => {
  it('notifies its subscribers after the writing code, before it can await anything', async () => {
    const store = new Store({ value: 1 })
    const onChange = vi.fn()
    store.subscribe(onChange)

    store.patch({ value: 2 })
    store.set({ value: 3 })
    expect(onChange).not.toHaveBeenCalled()

    await Promise.resolve()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(store.get()).toEqual({ value: 3 })
  })
})
