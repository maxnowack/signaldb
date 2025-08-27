import fs from 'fs/promises'
import type { EventEmitter } from '@signaldb/core'
import { it, expect } from 'vitest'
import { Collection } from '@signaldb/core'
import createFilesystemAdapter from '../src'

/**
 * Waits for a specific event to be emitted.
 * @template T
 * @param emitter - The event emitter instance.
 * @param event - The name of the event to wait for.
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

it('should persist changes to filesystem', { retry: 5 }, async () => {
  const file = `/tmp/${Math.floor(Math.random() * 1e17).toString(16)}.json`
  const persistence = createFilesystemAdapter(file)
  const collection = new Collection({ persistence })
  collection.on('persistence.error', (error) => {
    expect(error).toBeUndefined()
  })
  await waitForEvent(collection, 'persistence.init')

  await collection.insert({ id: '1', name: 'John' })
  await waitForEvent(collection, 'persistence.transmitted')

  const contents = await fs.readFile(file, 'utf8')
  expect(JSON.parse(contents)).toEqual([{ id: '1', name: 'John' }])
})

it('should persist data that was modified before persistence.init', { retry: 5 }, async () => {
  const file = `/tmp/${Math.floor(Math.random() * 1e17).toString(16)}.json`
  const persistence = createFilesystemAdapter(file)
  await persistence.save([], { added: [], removed: [], modified: [] })
  const collection = new Collection({ persistence })
  await collection.insert({ id: '1', name: 'John' })
  await collection.insert({ id: '2', name: 'Jane' })
  await collection.updateOne({ id: '1' }, { $set: { name: 'Johnny' } })
  await collection.removeOne({ id: '2' })
  await waitForEvent(collection, 'persistence.init')

  const items = collection.find().fetch()
  expect(items).toEqual([{ id: '1', name: 'Johnny' }])
  const contents = await fs.readFile(file, 'utf8')
  expect(JSON.parse(contents)).toEqual([{ id: '1', name: 'Johnny' }])
})
