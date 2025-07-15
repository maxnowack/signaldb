// @vitest-environment happy-dom
import type { EventEmitter } from '@signaldb/core'
import { describe, it, expect } from 'vitest'
import { Collection } from '@signaldb/core'
import createOPFSAdapter from '../src'

/**
 * Waits for a specific event to be emitted.
 * @param emitter - The event emitter.
 * @param event - The event to wait for.
 * @param [timeout] - Optional timeout in milliseconds.
 * @returns A promise that resolves with the event value.
 */
async function waitForEvent<T>(
  emitter: EventEmitter<any>,
  event: string,
  timeout?: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = timeout && setTimeout(() => {
      reject(new Error('waitForEvent timeout'))
    }, timeout)

    emitter.once(event, (value: T) => {
      if (timeoutId) clearTimeout(timeoutId)
      resolve(value)
    })
  })
}

describe('OPFS', () => {
  const fileContents: Record<string, string | null> = {}
  const mockedOPFS = {
    getDirectory: () => {
      const opfsRoot = {
        getFileHandle(filename: string, options?: { create: boolean }) {
          if (!Object.hasOwnProperty.call(fileContents, filename)) {
            if (options?.create) {
              fileContents[filename] = null
            } else {
              return Promise.reject(new Error('File not found'))
            }
          }

          const fileHandle = {
            getFile() {
              return Promise.resolve({
                text() {
                  return Promise.resolve(fileContents[filename])
                },
              })
            },
            createWritable() {
              return Promise.resolve({
                write(data: string) {
                  fileContents[filename] = data
                  return Promise.resolve()
                },
                close() {
                  return Promise.resolve()
                },
              })
            },
          }

          return fileHandle
        },
      }
      return Promise.resolve(opfsRoot)
    },
  }

  // @ts-expect-error mocking navigator.storage for testing purposes
  navigator.storage = mockedOPFS

  it('should load items from OPFS persistence adapter', async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should save items to OPFS persistence adapter', async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')
    await collection.insert({ id: '1', name: 'John' })
    await waitForEvent(collection, 'persistence.transmitted')
    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'John' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '1', name: 'John' }])
  })

  it('should remove item from OPFS persistence adapter', async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '2', name: 'Jane' }])
  })

  it('should update item in OPFS persistence adapter', async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [{ id: '1', name: 'John' }], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '1', name: 'Johnny' }])
  })

  it('should not modify original items in OPFS persistence adapter', async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    const originalItems = [{ id: '1', name: 'John' }]
    await persistence.save([], { added: originalItems, removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')

    expect(originalItems).toEqual([{ id: '1', name: 'John' }])
  })

  it('should handle multiple operations in order', async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await waitForEvent(collection, 'persistence.init')

    await collection.insert({ id: '1', name: 'John' })
    await waitForEvent(collection, 'persistence.transmitted')
    await collection.insert({ id: '2', name: 'Jane' })
    await waitForEvent(collection, 'persistence.transmitted')
    await collection.removeOne({ id: '1' })
    await waitForEvent(collection, 'persistence.transmitted')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '2', name: 'Jane' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '2', name: 'Jane' }])
  })

  it('should persist data that was modified before persistence.init on client side', { retry: 5 }, async () => {
    const persistence = createOPFSAdapter(`test-${Math.floor(Math.random() * 1e17).toString(16)}`)
    await persistence.save([], { added: [], removed: [], modified: [] })
    const collection = new Collection({ persistence })
    await collection.insert({ id: '1', name: 'John' })
    await collection.insert({ id: '2', name: 'Jane' })
    await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
    await collection.removeOne({ id: '2' })
    await waitForEvent(collection, 'persistence.init')

    const items = collection.find().fetch()
    expect(items).toEqual([{ id: '1', name: 'Johnny' }])
    const loadResult = await persistence.load()
    expect(loadResult.items).toEqual([{ id: '1', name: 'Johnny' }])
  })
})
