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
  await vi.waitFor(() => expect(collection.isLoading()).toBe(false))
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(response.items)
})

it('should remove query when observer is disposed', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => {
    for (const callback of disposalCallbacks) callback()
  }
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
    purgeDelay: 0,
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
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  }) // wait a bit to ensure the observer disposal was executed
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
  const disposeAll = () => {
    for (const callback of disposalCallbacks) callback()
  }
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
    purgeDelay: 0,
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
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  }) // wait a bit to ensure the observer disposal was executed
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should handle multiple queries', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => {
    for (const callback of disposalCallbacks) callback()
  }
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
    purgeDelay: 0,
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
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(responseAllItems.items)

  disposeAll()
  await waitForEvent(collection, 'persistence.received')
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  }) // wait a bit to ensure the observer disposal was executed
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should update items with result of new fetch', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => {
    for (const callback of disposalCallbacks) callback()
  }
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
    purgeDelay: 0,
  })

  // Mock fetchQueryItems response
  const responseItems = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }]
  fetchQueryItems.mockImplementation((selector) => {
    if (selector.id) {
      return Promise.resolve({
        items: [...responseItems.filter(index => index.id !== 1), { id: 1, name: 'Item 1 updated' }],
      })
    }
    return Promise.resolve({ items: responseItems })
  })

  expect(collection.find({}).fetch()).toEqual([])
  await waitForEvent(collection, 'persistence.received')
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(1))
  expect(collection.find({}).fetch()).toEqual(responseItems)

  expect(collection.findOne({ id: 1 })).toEqual(responseItems[0])
  await waitForEvent(collection, 'persistence.received')
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(2))
  expect(collection.findOne({ id: 1 })).toEqual({ id: 1, name: 'Item 1 updated' })

  disposeAll()
  await waitForEvent(collection, 'persistence.received')
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  }) // wait a bit to ensure the observer disposal was executed
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should purge items after specified delay', async () => {
  const fetchQueryItems = vi.fn()
  const disposalCallbacks: (() => void)[] = []
  const disposeAll = () => {
    for (const callback of disposalCallbacks) callback()
  }
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
    purgeDelay: 500,
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
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  }) // wait a bit to ensure the observer disposal was executed
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(response.items)

  await new Promise((resolve) => {
    setTimeout(resolve, 500)
  }) // wait a bit to ensure the observer disposal was executed
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should register and unregister queries', async () => {
  const fetchQueryItems = vi.fn()
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    fetchQueryItems,
    purgeDelay: 0,
    reactivity: createReactivityAdapter({
      create: () => ({
        depend: vi.fn(),
        notify: vi.fn(),
      }),

      // always return false to simulate that the collection is not in scope
      // we use the registerQuery and unregisterQuery methods
      isInScope: () => false,
    }),
  })

  // Mock fetchQueryItems response
  const response = {
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  }
  fetchQueryItems.mockResolvedValue(response)

  expect(collection.find({}).fetch()).toEqual([])
  expect(fetchQueryItems).toBeCalledTimes(0)
  collection.registerQuery({})
  await waitForEvent(collection, 'persistence.received')

  // Wait for fetchQueryItems to be called
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(1))
  expect(collection.find({}).fetch()).toEqual(response.items)

  collection.unregisterQuery({})
  await waitForEvent(collection, 'persistence.received')
  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  }) // wait a bit to ensure the observer disposal was executed
  expect(collection.find({}, { reactive: false }).fetch()).toEqual([])
})

it('should keep track which items and which fields were returned by a query', async () => {
  const fetchQueryItems = vi.fn().mockImplementation((selector: Record<string, any>) => {
    if (selector.id === 1) {
      return Promise.resolve({
        items: [{ id: 1, name: 'Jane', age: 30, country: 'AU' }],
      })
    }
    if (selector.id === 2) {
      return Promise.resolve({
        items: [{ id: 2, name: 'John', age: 35, country: 'US' }],
      })
    }

    if (selector.age) {
      return Promise.resolve({
        items: [{ id: 2, name: 'John', age: 35 }, { id: 1, name: 'Jane', age: 30 }],
      })
    }

    return Promise.resolve({
      items: [{ id: 1, name: 'Jane' }, { id: 2, name: 'John' }],
    })
  })

  const collection = new AutoFetchCollection({
    fetchQueryItems,
    purgeDelay: 0,
    reactivity: createReactivityAdapter({
      create: () => ({
        depend: vi.fn(),
        notify: vi.fn(),
      }),

      // always return false to simulate that the collection is not in scope
      // we use the registerQuery and unregisterQuery methods
      isInScope: () => false,
    }),
  })

  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([])
  expect(fetchQueryItems).toBeCalledTimes(0)

  collection.registerQuery({})
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(1))
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([
    { id: 1, name: 'Jane' },
    { id: 2, name: 'John' },
  ])

  collection.registerQuery({ age: { gt: 20 } })
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(2))
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([
    { id: 1, name: 'Jane', age: 30 },
    { id: 2, name: 'John', age: 35 },
  ])

  collection.registerQuery({ id: 1 })
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(3))
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([
    { id: 1, name: 'Jane', age: 30, country: 'AU' },
    { id: 2, name: 'John', age: 35 },
  ])

  collection.unregisterQuery({ age: { gt: 20 } })
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([
    { id: 1, name: 'Jane', age: 30, country: 'AU' },
    { id: 2, name: 'John' },
  ])

  collection.unregisterQuery({})
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([
    { id: 1, name: 'Jane', age: 30, country: 'AU' },
  ])

  collection.unregisterQuery({ id: 1 })
  await waitForEvent(collection, 'persistence.received')
  expect(collection.find({}, { sort: { id: 1 } }).fetch()).toEqual([])
})

it('should refetch query items when onChange was called', async () => {
  const fetchQueryItems = vi.fn()
  const reactivity = {
    create: () => ({
      depend: vi.fn(),
      notify: vi.fn(),
    }),
  }
  const remoteChange = vi.fn().mockResolvedValue(undefined)
  const collection = new AutoFetchCollection({
    push: vi.fn(),
    registerRemoteChange: (onChange) => {
      remoteChange.mockImplementation(onChange)
      return Promise.resolve()
    },
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
  await vi.waitFor(() => expect(collection.isLoading()).toBe(false))
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(response.items)

  const response2 = {
    items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item xxx' }],
  }
  fetchQueryItems.mockResolvedValue(response2)

  await remoteChange()

  // Wait for fetchQueryItems to be called
  await vi.waitFor(() => expect(fetchQueryItems).toBeCalledTimes(2))
  await vi.waitFor(() => expect(collection.isLoading({})).toBe(false))
  await vi.waitFor(() => expect(collection.isLoading()).toBe(false))
  expect(collection.find({}, { reactive: false }).fetch()).toEqual(response2.items)
})
