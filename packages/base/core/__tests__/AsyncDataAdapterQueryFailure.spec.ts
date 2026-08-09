import { vi, describe, it, expect } from 'vitest'
import AsyncDataAdapter, { QueryError } from '../src/AsyncDataAdapter'
import Collection from '../src/Collection'
import type StorageAdapter from '../src/types/StorageAdapter'

interface TestItem {
  id: string,
  name: string,
}

/**
 * Fails the first `failures` calls to `readAll`, then behaves normally.
 * `Infinity` makes it fail permanently.
 */
class FlakyStorageAdapter implements StorageAdapter<TestItem, string> {
  public readAllCalls = 0
  private items = new Map<string, TestItem>()

  constructor(private failures: number) {}

  teardown(): Promise<void> {
    return Promise.resolve()
  }
  dropIndex(): Promise<void> {
    throw new Error('Method not implemented.')
  }
  removeAll(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async setup(): Promise<void> {}
  async createIndex(): Promise<void> {}
  async readIndex(): Promise<Map<any, Set<string>>> {
    return new Map()
  }

  async readAll(): Promise<TestItem[]> {
    this.readAllCalls += 1
    if (this.readAllCalls <= this.failures) throw new Error('storage exploded')
    return [...this.items.values()]
  }

  async readIds(ids: string[]): Promise<TestItem[]> {
    return ids.map(id => this.items.get(id)).filter((item): item is TestItem => item != null)
  }

  async insert(items: TestItem[]): Promise<void> {
    for (const item of items) this.items.set(item.id, item)
  }

  async replace(items: TestItem[]): Promise<void> {
    for (const item of items) this.items.set(item.id, item)
  }

  async remove(items: TestItem[]): Promise<void> {
    for (const item of items) this.items.delete(item.id)
  }
}

const createCollection = (storage: FlakyStorageAdapter, onError: (error: Error) => void) => {
  const dataAdapter = new AsyncDataAdapter({
    storage: () => storage,
    onError,
    // No real waiting in tests — the backoff itself is not what's under test.
    retry: { attempts: 3, delay: () => 0 },
  })
  return new Collection<TestItem>('items', dataAdapter)
}

const flush = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 20)
})

describe('AsyncDataAdapter query failures', () => {
  it('recovers from a transient failure without ever publishing an error', async () => {
    const storage = new FlakyStorageAdapter(1)
    const onError = vi.fn()
    const collection = createCollection(storage, onError)
    await collection.ready()

    const seen: number[] = []
    const cursor = collection.find({})
    const stop = cursor.observeChanges({
      addedBefore: () => {
        seen.push(1)
      },
    })
    await collection.insert({ id: 'a', name: 'first' })
    await flush()

    expect(onError).not.toHaveBeenCalled()
    expect(await collection.find({}, { async: true }).fetch()).toHaveLength(1)
    stop()
  })

  it('reports a permanent failure once, with collection and selector attached', async () => {
    const storage = new FlakyStorageAdapter(Number.POSITIVE_INFINITY)
    const onError = vi.fn()
    const collection = createCollection(storage, onError)
    await collection.ready()

    const queryErrors: Error[] = []
    collection.on('query.error', (error) => {
      queryErrors.push(error)
    })

    const cursor = collection.find({ name: 'nope' })
    const stop = cursor.observeChanges({ addedBefore: () => {} })
    await flush()

    expect(onError).toHaveBeenCalled()
    const reported = onError.mock.calls[0][0] as QueryError
    expect(reported).toBeInstanceOf(QueryError)
    expect(reported.collectionName).toBe('items')
    expect(reported.selector).toEqual({ name: 'nope' })
    expect(reported.attempts).toBe(3)
    // Retried the configured number of times before giving up.
    expect(storage.readAllCalls).toBe(3)
    expect(queryErrors.length).toBeGreaterThan(0)
    stop()
  })
})
