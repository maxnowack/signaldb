import { describe, it, expect, vi, beforeEach } from 'vitest'
import Observer from '../src/Collection/Observer'
import type { ObserveCallbacks } from '../src/Collection/Observer'
import { diffQueryResults } from '../src/utils/queryDelta'

interface TestItem {
  id: number,
  name: string,
  rank?: number,
}

describe('Observer.applyDelta', () => {
  let observer: Observer<TestItem>
  let callbacks: Required<{
    [Event in keyof ObserveCallbacks<TestItem>]: ReturnType<typeof vi.fn>
  }>

  const initial: TestItem[] = [
    { id: 1, name: 'One' },
    { id: 2, name: 'Two' },
    { id: 3, name: 'Three' },
  ]

  beforeEach(() => {
    observer = new Observer<TestItem>(() => () => {})
    callbacks = {
      added: vi.fn(),
      addedBefore: vi.fn(),
      changed: vi.fn(),
      changedField: vi.fn(),
      movedBefore: vi.fn(),
      removed: vi.fn(),
    }
    observer.addCallbacks(callbacks as ObserveCallbacks<TestItem>)
    observer.runChecks(() => initial)
    Object.values(callbacks).forEach(callback => callback.mockClear())
  })

  const deltaTo = (next: TestItem[]) => diffQueryResults(initial, next)

  it('should report an addition with the item that follows it', () => {
    const item = { id: 0, name: 'Zero' }
    const applied = observer.applyDelta(deltaTo([item, ...initial]), () => initial)

    expect(applied).toBe(true)
    expect(callbacks.added).toHaveBeenCalledExactlyOnceWith(item)
    expect(callbacks.addedBefore).toHaveBeenCalledExactlyOnceWith(item, initial[0])
  })

  it('should report an addition at the end with no item after it', () => {
    const item = { id: 4, name: 'Four' }
    observer.applyDelta(deltaTo([...initial, item]), () => initial)

    expect(callbacks.addedBefore).toHaveBeenCalledExactlyOnceWith(item, null)
  })

  it('should report a removal with the item as it was', () => {
    observer.applyDelta(deltaTo([initial[0], initial[2]]), () => initial)

    expect(callbacks.removed).toHaveBeenCalledExactlyOnceWith(initial[1])
  })

  it('should report a change with the new item', () => {
    const changed = { id: 2, name: 'Zwei' }
    observer.applyDelta(deltaTo([initial[0], changed, initial[2]]), () => initial)

    expect(callbacks.changed).toHaveBeenCalledExactlyOnceWith(changed, initial[1])
  })

  it('should report which field of a changed item differs', () => {
    const changed = { id: 2, name: 'Zwei' }
    observer.applyDelta(deltaTo([initial[0], changed, initial[2]]), () => initial)

    expect(callbacks.changedField).toHaveBeenCalledExactlyOnceWith(changed, 'name', 'Two', 'Zwei')
  })

  it('should report a field that only exists after the change', () => {
    const changed = { id: 2, name: 'Two', rank: 5 }
    observer.applyDelta(deltaTo([initial[0], changed, initial[2]]), () => initial)

    expect(callbacks.changedField).toHaveBeenCalledExactlyOnceWith(changed, 'rank', undefined, 5)
  })

  it('should report a move with the item that follows it', () => {
    observer.applyDelta(deltaTo([initial[2], initial[0], initial[1]]), () => initial)

    expect(callbacks.movedBefore).toHaveBeenCalledExactlyOnceWith(initial[2], initial[0])
  })

  it('should leave the result it holds equal to what the delta produces', () => {
    const next = [initial[2], { id: 1, name: 'Eins' }, { id: 4, name: 'Four' }]
    observer.applyDelta(deltaTo(next), () => initial)

    const later = vi.fn()
    observer.addCallbacks({ added: later, removed: later, changed: later }, true)
    observer.runChecks(() => next)
    expect(later).not.toHaveBeenCalled()
  })

  it('should not report anything for a delta that changes nothing', () => {
    observer.applyDelta(deltaTo(initial), () => initial)

    Object.values(callbacks).forEach((callback) => {
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('when the delta does not fit what it holds', () => {
    const foreignDelta = () => diffQueryResults(
      [{ id: 9, name: 'Nine' }],
      [{ id: 9, name: 'Niner' }],
    )

    it('should refuse the delta', () => {
      expect(observer.applyDelta(foreignDelta(), () => initial)).toBe(false)
    })

    it('should fall back to comparing against the current items', () => {
      const next = [initial[0]]
      observer.applyDelta(foreignDelta(), () => next)

      expect(callbacks.removed).toHaveBeenCalledTimes(2)
    })

    it('should not report anything from the refused delta itself', () => {
      observer.applyDelta(foreignDelta(), () => initial)

      Object.values(callbacks).forEach((callback) => {
        expect(callback).not.toHaveBeenCalled()
      })
    })
  })

  it('should do nothing when no callback is interested', () => {
    const bare = new Observer<TestItem>(() => () => {})
    bare.runChecks(() => initial)
    expect(bare.applyDelta(deltaTo([initial[0]]), () => initial)).toBe(true)
  })
})
