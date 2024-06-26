import { vi, it, expect } from 'vitest'
import { AutoFetchCollection, createReactivityAdapter } from '../src'
import waitForEvent from './helpers/waitForEvent'

it('should fetch query items when observer is created', async () => {
  const fetchQueryItems = vi.fn()
  const reactivity = {
    create: () => ({
      depend: vi.fn(),
      notify: vi.fn(),
    }),
  }
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    fetchQueryItems,
    reactivity,
  })

  // Mock fetchQueryItems response
  const response = {
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  }
  fetchQueryItems.mockResolvedValue(response)

  expect(collection.find({}).fetch()).toEqual([])
  await waitForEvent(collection, 'persistence.received')

  // Wait for fetchQueryItems to be called
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(1))
  await vi.waitFor(() => expect(collection.isLoading({})).toBe(false))
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(response.items)
})

it('should remove query when observer is disposed', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => disposalCallbacks.forEach(callback => callback())
  const reactivity = createReactivityAdapter({
    create: () => ({
      depend: vi.fn(),
      notify: vi.fn(),
    }),
    onDispose(callback) {
      disposalCallbacks.push(callback)
    },
  })
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    fetchQueryItems,
    reactivity,
  })

  // Mock fetchQueryItems response
  const response = {
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  }
  fetchQueryItems.mockResolvedValue(response)

  expect(collection.find({}).fetch()).toEqual([])
  await waitForEvent(collection, 'persistence.received')

  // Wait for fetchQueryItems to be called
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(1))
  expect(collection.find({}).fetch()).toEqual(response.items)

  disposeAll()
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should trigger persistence.error event when fetchQueryItems fails', async () => {
  const fetchQueryItems = vi.fn()
  const reactivity = createReactivityAdapter({
    create: () => ({
      depend: vi.fn(),
      notify: vi.fn(),
    }),
  })
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    fetchQueryItems,
    reactivity,
  })

  const error = new Error('Failed to fetch query items')
  fetchQueryItems.mockRejectedValue(error)

  expect(collection.find({}).fetch()).toEqual([])

  await waitForEvent(collection, 'persistence.error')
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should handle multiple observers for the same query', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => disposalCallbacks.forEach(callback => callback())
  const reactivity = createReactivityAdapter({
    create: () => ({
      depend: vi.fn(),
      notify: vi.fn(),
    }),
    onDispose(callback) {
      disposalCallbacks.push(callback)
    },
  })
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    fetchQueryItems,
    reactivity,
  })

  // Mock fetchQueryItems response
  const response = {
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  }
  fetchQueryItems.mockResolvedValue(response)

  expect(collection.find({}).fetch()).toEqual([])
  expect(collection.find({}).fetch()).toEqual([])
  expect(collection.find({}).fetch()).toEqual([])
  expect(collection.find({}).fetch()).toEqual([])
  expect(collection.find({}).fetch()).toEqual([])
  await waitForEvent(collection, 'persistence.received')

  // Wait for fetchQueryItems to be called
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(1))
  expect(collection.find({}).fetch()).toEqual(response.items)

  disposeAll()
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should handle multiple queriey', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => disposalCallbacks.forEach(callback => callback())
  const reactivity = createReactivityAdapter({
    create: () => ({
      depend: vi.fn(),
      notify: vi.fn(),
    }),
    onDispose(callback) {
      disposalCallbacks.push(callback)
    },
  })
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    fetchQueryItems,
    reactivity,
  })

  const responseAllItems = {
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  }
  const responseFilteredItems = {
    items: [{ id: 1, name: 'Item 1' }],
  }
  fetchQueryItems.mockImplementation((selector) => {
    if (selector.name) return Promise.resolve(responseFilteredItems)
    return Promise.resolve(responseAllItems)
  })

  expect(collection.find({ name: 'Item 1' }).fetch()).toEqual([])
  expect(fetchQueryItems).toBeCalledWith({ name: 'Item 1' })
  await waitForEvent(collection, 'persistence.received')
  expect(fetchQueryItems).toBeCalledTimes(1)
  expect(collection.find({}).fetch()).toEqual(responseFilteredItems.items)

  expect(fetchQueryItems).toBeCalledWith({})
  expect(fetchQueryItems).toBeCalledTimes(2)
  await waitForEvent(collection, 'persistence.received')
  await new Promise((resolve) => { setTimeout(resolve, 100) }) // wait a bit to ensure fetchQueryItems cache was updated
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(responseAllItems.items)

  disposeAll()
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})
