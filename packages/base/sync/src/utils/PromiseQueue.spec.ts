import { it, expect, vi } from 'vitest'
import PromiseQueue from './PromiseQueue'

it('should process tasks in order', async () => {
  const queue = new PromiseQueue()
  const results: number[] = []

  await queue.add(() => Promise.resolve(results.push(1)))
  await queue.add(() => Promise.resolve(results.push(2)))
  await queue.add(() => Promise.resolve(results.push(3)))

  expect(results).toEqual([1, 2, 3])
})

it('should handle rejected promises', async () => {
  const queue = new PromiseQueue()
  const results: string[] = []

  await expect(
    queue.add(() => Promise.reject(new Error('Task failed'))),
  ).rejects.toThrow('Task failed')

  await queue.add(() => Promise.resolve(results.push('success')))

  expect(results).toEqual(['success'])
})

it('should maintain the order even with mixed resolve and reject', async () => {
  const queue = new PromiseQueue()
  const results: string[] = []

  await expect(
    queue.add(() => Promise.reject(new Error('Task 1 failed'))),
  ).rejects.toThrow('Task 1 failed')

  await queue.add(() => Promise.resolve(results.push('Task 2 succeeded')))
  await expect(
    queue.add(() => Promise.reject(new Error('Task 3 failed'))),
  ).rejects.toThrow('Task 3 failed')
  await queue.add(() => Promise.resolve(results.push('Task 4 succeeded')))

  expect(results).toEqual(['Task 2 succeeded', 'Task 4 succeeded'])
})

it('should indicate pending promises correctly', async () => {
  const queue = new PromiseQueue()

  const task1 = vi.fn().mockResolvedValue('Task 1')
  const task2 = vi.fn().mockResolvedValue('Task 2')

  const task1Promise = queue.add(task1)
  expect(queue.hasPendingPromise()).toBe(true)

  const task2Promise = queue.add(task2)
  await task2Promise
  await expect(task1Promise).resolves.toBe('Task 1')
  expect(queue.hasPendingPromise()).toBe(false)
})

it('should correctly process an empty queue', () => {
  const queue = new PromiseQueue()
  expect(queue.hasPendingPromise()).toBe(false)
})

it('should handle a long queue of tasks', async () => {
  const queue = new PromiseQueue()
  const results: number[] = []
  const tasks = Array.from({ length: 100 }, (_, i) => () =>
    Promise.resolve(results.push(i)))

  await Promise.all(tasks.map(task => queue.add(task)))

  expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i))
})

it('should handle tasks added after some delay', async () => {
  const queue = new PromiseQueue()
  const results: string[] = []

  await queue.add(() => new Promise((resolve) => {
    setTimeout(() => resolve(results.push('Task 1')), 5)
  }))
  await new Promise((resolve) => {
    setTimeout(resolve, 10)
  }) // Wait before adding the next task
  await queue.add(() => Promise.resolve(results.push('Task 2')))

  expect(results).toEqual(['Task 1', 'Task 2'])
})

it('should process tasks sequentially without overlap', async () => {
  const queue = new PromiseQueue()
  const results: string[] = []

  let concurrentTasks = 0

  const createTask = (name: string, duration: number) => () =>
    new Promise<void>((resolve) => {
      concurrentTasks += 1
      if (concurrentTasks > 1) {
        throw new Error('Tasks are running concurrently')
      }
      setTimeout(() => {
        results.push(name)
        concurrentTasks -= 1
        resolve()
      }, duration)
    })

  await queue.add(createTask('Task 1', 5))
  await queue.add(createTask('Task 2', 3))
  await queue.add(createTask('Task 3', 1))

  expect(results).toEqual(['Task 1', 'Task 2', 'Task 3'])
})

it('should handle multiple rejections correctly', async () => {
  const queue = new PromiseQueue()
  const results: string[] = []

  await expect(
    queue.add(() => Promise.reject(new Error('Task 1 failed'))),
  ).rejects.toThrow('Task 1 failed')

  await queue.add(() => Promise.resolve(results.push('Task 2 succeeded')))
  await expect(
    queue.add(() => Promise.reject(new Error('Task 3 failed'))),
  ).rejects.toThrow('Task 3 failed')
  await queue.add(() => Promise.resolve(results.push('Task 4 succeeded')))

  expect(results).toEqual(['Task 2 succeeded', 'Task 4 succeeded'])
})

it('should handle tasks with long execution times', async () => {
  const queue = new PromiseQueue()
  const results: string[] = []

  const task1 = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
    setTimeout(() => {
      results.push('Task 1')
      resolve()
    }, 20)
  }))

  const task2 = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
    setTimeout(() => {
      results.push('Task 2')
      resolve()
    }, 10)
  }))

  await queue.add(task1)
  await queue.add(task2)

  expect(results).toEqual(['Task 1', 'Task 2'])
})

it('should handle queue edge case with concurrent access', async () => {
  const queue = new PromiseQueue()

  // Create a scenario that bypasses the length check but has empty queue
  // Modify the internal queue to simulate a race condition
  const internalQueue = (queue as any).queue

  // Override Array.shift to return undefined once to test line 48
  const originalShift = internalQueue.shift
  let shiftCallCount = 0
  internalQueue.shift = function () {
    shiftCallCount++
    if (shiftCallCount === 1) {
      // First call returns undefined to simulate empty queue despite length check
      return
    }
    return originalShift.call(this)
  }

  // Set up a state where dequeue will be called
  internalQueue.push(() => Promise.resolve('test'))

  // This should trigger the dequeue logic and hit line 48
  // @ts-expect-error - accessing private method
  queue.dequeue()

  // Restore original behavior
  internalQueue.shift = originalShift

  expect(queue.hasPendingPromise()).toBe(false)
})
