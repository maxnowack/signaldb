import { describe, it, expect, vi } from 'vitest'
import ItemStore from './ItemStore'

describe('ItemStore', () => {
  it('notifies its subscribers after the writing code, before it can await anything', async () => {
    const store = new ItemStore<{ value: number }>()
    const onChange = vi.fn()
    const onItemChange = vi.fn()
    store.subscribe(onChange)
    store.subscribeItem('a', onItemChange)

    const item = store.register('a', { value: 1 })
    item.patch({ value: 2 })
    store.unregister('a')
    expect(onChange).not.toHaveBeenCalled()

    await Promise.resolve()
    expect(onChange.mock.calls).toEqual([['a'], ['a'], ['a']])
    expect(onItemChange).toHaveBeenCalledTimes(3)
  })
})
