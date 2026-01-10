import { describe, it, expect, vi, beforeEach } from 'vitest'
import Observer from '../src/Collection/Observer'

interface TestItem {
  id: number,
  name: string,
}

describe('Observer', () => {
  let observer: Observer<TestItem>
  let unbindEventsMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    unbindEventsMock = vi.fn()
    observer = new Observer<TestItem>(() => unbindEventsMock as () => void)
  })

  describe('runChecks', () => {
    it('should handle synchronous items', () => {
      const items: TestItem[] = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]

      const addedCallback = vi.fn()
      observer.addCallbacks({ added: addedCallback })

      observer.runChecks(() => items)

      expect(addedCallback).toHaveBeenCalledWith(items[0])
      expect(addedCallback).toHaveBeenCalledWith(items[1])
      expect(addedCallback).toHaveBeenCalledTimes(2)
    })

    it('should handle asynchronous items that resolve successfully', async () => {
      const items: TestItem[] = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]

      const addedCallback = vi.fn()
      observer.addCallbacks({ added: addedCallback })

      observer.runChecks(() => Promise.resolve(items))

      // Wait for the promise to resolve
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(addedCallback).toHaveBeenCalledWith(items[0])
      expect(addedCallback).toHaveBeenCalledWith(items[1])
      expect(addedCallback).toHaveBeenCalledTimes(2)
    })

    it('should log error when asynchronous query fails', async () => {
      const errorMessage = 'Failed to fetch items'
      const error = new Error(errorMessage)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      observer.runChecks(() => Promise.reject(error))

      // Wait for the promise to reject
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error while asynchronously querying items', error)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('addCallbacks and removeCallbacks', () => {
    it('should add and trigger added callback', () => {
      const addedCallback = vi.fn()
      observer.addCallbacks({ added: addedCallback })

      const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
      observer.runChecks(() => items)

      expect(addedCallback).toHaveBeenCalledWith(items[0])
    })

    it('should remove callbacks', () => {
      const addedCallback = vi.fn()
      observer.addCallbacks({ added: addedCallback })
      observer.removeCallbacks({ added: addedCallback })

      const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
      observer.runChecks(() => items)

      expect(addedCallback).not.toHaveBeenCalled()
    })

    it('should skip initial callbacks when skipInitial is true', () => {
      const addedCallback = vi.fn()
      observer.addCallbacks({ added: addedCallback }, true)

      const items: TestItem[] = [{ id: 1, name: 'Item 1' }]
      observer.runChecks(() => items)

      expect(addedCallback).not.toHaveBeenCalled()
    })
  })

  describe('isEmpty', () => {
    it('should return true when no callbacks are registered', () => {
      expect(observer.isEmpty()).toBe(true)
    })

    it('should return false when callbacks are registered', () => {
      observer.addCallbacks({ added: vi.fn() })
      expect(observer.isEmpty()).toBe(false)
    })
  })

  describe('stop', () => {
    it('should call unbindEvents', () => {
      observer.stop()
      expect(unbindEventsMock).toHaveBeenCalledOnce()
    })
  })

  describe('changed and changedField callbacks', () => {
    it('should trigger changed callback when item is modified', () => {
      const changedCallback = vi.fn()
      observer.addCallbacks({ changed: changedCallback })

      const items1: TestItem[] = [{ id: 1, name: 'Item 1' }]
      observer.runChecks(() => items1)

      const items2: TestItem[] = [{ id: 1, name: 'Item 1 Updated' }]
      observer.runChecks(() => items2)

      expect(changedCallback).toHaveBeenCalledWith(items2[0])
    })

    it('should trigger changedField callback for specific field changes', () => {
      const changedFieldCallback = vi.fn()
      observer.addCallbacks({ changedField: changedFieldCallback })

      const items1: TestItem[] = [{ id: 1, name: 'Item 1' }]
      observer.runChecks(() => items1)

      const items2: TestItem[] = [{ id: 1, name: 'Item 1 Updated' }]
      observer.runChecks(() => items2)

      expect(changedFieldCallback).toHaveBeenCalledWith(items2[0], 'name', 'Item 1', 'Item 1 Updated')
    })
  })

  describe('removed callback', () => {
    it('should trigger removed callback when item is deleted', () => {
      const removedCallback = vi.fn()
      observer.addCallbacks({ removed: removedCallback })

      const items1: TestItem[] = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }]
      observer.runChecks(() => items1)

      const items2: TestItem[] = [{ id: 2, name: 'Item 2' }]
      observer.runChecks(() => items2)

      expect(removedCallback).toHaveBeenCalledWith(items1[0])
    })
  })

  describe('movedBefore callback', () => {
    it('should trigger movedBefore callback when item position changes', () => {
      const movedBeforeCallback = vi.fn()
      observer.addCallbacks({ movedBefore: movedBeforeCallback })

      const items1: TestItem[] = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }]
      observer.runChecks(() => items1)

      const items2: TestItem[] = [{ id: 2, name: 'Item 2' }, { id: 1, name: 'Item 1' }]
      observer.runChecks(() => items2)

      expect(movedBeforeCallback).toHaveBeenCalled()
    })
  })

  describe('addedBefore callback', () => {
    it('should trigger addedBefore callback with correct before item', () => {
      const addedBeforeCallback = vi.fn()
      observer.addCallbacks({ addedBefore: addedBeforeCallback })

      const items: TestItem[] = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }]
      observer.runChecks(() => items)

      expect(addedBeforeCallback).toHaveBeenCalledWith(items[0], items[1])
      expect(addedBeforeCallback).toHaveBeenCalledWith(items[1], null)
    })
  })
})
