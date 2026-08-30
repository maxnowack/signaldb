import { describe, it, expect, beforeEach, vi } from 'vitest'
import Collection from '../src/Collection'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import type { CollectionBackend } from '../src/DataAdapter'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
}

describe('what a write asks the data layer for', () => {
  let collection: Collection<TestItem>
  let executeQuery: ReturnType<typeof vi.spyOn>

  const seed: TestItem[] = [
    { id: 'a', status: 'open', rank: 1, name: 'Anna' },
    { id: 'b', status: 'open', rank: 2, name: 'Ben' },
  ]

  beforeEach(async () => {
    const storage = memoryStorageAdapter<TestItem>(seed.map(item => ({ ...item })))
    collection = new Collection<TestItem>('items', new AsyncDataAdapter({ storage: () => storage }))
    await Promise.resolve(collection.isReady())
    const backend = (collection as any).backend as CollectionBackend<TestItem, string>
    executeQuery = vi.spyOn(backend, 'executeQuery')
  })

  describe('with nothing validating items', () => {
    it('does not look an item up before updating it', async () => {
      await collection.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } })
      expect(executeQuery).not.toHaveBeenCalled()
    })

    it('does not look items up before updating many', async () => {
      await collection.updateMany({ status: 'open' }, { $set: { name: 'renamed' } })
      expect(executeQuery).not.toHaveBeenCalled()
    })

    it('does not look an item up before replacing it', async () => {
      await collection.replaceOne({ id: 'a' }, { status: 'done', rank: 9, name: 'Ann' })
      expect(executeQuery).not.toHaveBeenCalled()
    })
  })

  describe('with something validating items', () => {
    it('looks the item up so a validator sees it before the write', async () => {
      const seen: TestItem[] = []
      collection.on('validate', item => seen.push(item))

      await collection.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } })

      expect(executeQuery).toHaveBeenCalled()
      expect(seen).toEqual([{ id: 'a', status: 'open', rank: 1, name: 'Annabel' }])
    })

    it('lets a validator that throws stop the write', async () => {
      collection.on('validate', () => {
        throw new Error('nope')
      })

      await expect(collection.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } }))
        .rejects.toThrow('nope')
      expect(await collection.find({ id: 'a' }, { async: true }).fetch())
        .toEqual([{ id: 'a', status: 'open', rank: 1, name: 'Anna' }])
    })

    it('validates every item a batch update touches', async () => {
      const seen: TestItem[] = []
      collection.on('validate', item => seen.push(item))

      await collection.updateMany({ status: 'open' }, { $set: { name: 'renamed' } })

      expect(seen.map(item => item.id)).toEqual(['a', 'b'])
      expect(seen.every(item => item.name === 'renamed')).toBe(true)
    })

    it('validates the replacement before replacing', async () => {
      const seen: TestItem[] = []
      collection.on('validate', item => seen.push(item))

      await collection.replaceOne({ id: 'a' }, { status: 'done', rank: 9, name: 'Ann' })

      expect(seen).toEqual([{ id: 'a', status: 'done', rank: 9, name: 'Ann' }])
    })
  })

  describe('what it reports afterwards', () => {
    it('reports the updated item', async () => {
      const changed = vi.fn()
      collection.on('changed', changed)

      const count = await collection.updateOne({ id: 'a' }, { $set: { name: 'Annabel' } })

      expect(count).toBe(1)
      expect(changed).toHaveBeenCalledExactlyOnceWith(
        { id: 'a', status: 'open', rank: 1, name: 'Annabel' },
        { $set: { name: 'Annabel' } },
        { id: 'a', status: 'open', rank: 1, name: 'Anna' },
      )
    })

    it('reports every item a batch update changed', async () => {
      const changed = vi.fn()
      collection.on('changed', changed)

      const count = await collection.updateMany({ status: 'open' }, { $set: { name: 'renamed' } })

      expect(count).toBe(2)
      expect(changed).toHaveBeenCalledTimes(2)
    })

    it('reports the replacement', async () => {
      const changed = vi.fn()
      collection.on('changed', changed)

      const count = await collection.replaceOne({ id: 'a' }, { status: 'done', rank: 9, name: 'Ann' })

      expect(count).toBe(1)
      expect(changed).toHaveBeenCalledExactlyOnceWith(
        { id: 'a', status: 'done', rank: 9, name: 'Ann' },
        { status: 'done', rank: 9, name: 'Ann' },
        { id: 'a', status: 'open', rank: 1, name: 'Anna' },
      )
    })

    it('reports nothing when the write matched nothing', async () => {
      const changed = vi.fn()
      collection.on('changed', changed)

      const count = await collection.updateOne({ id: 'missing' }, { $set: { name: 'x' } })

      expect(count).toBe(0)
      expect(changed).not.toHaveBeenCalled()
    })
  })

  describe('upsert', () => {
    it('inserts when an update matches nothing', async () => {
      const count = await collection.updateOne(
        { id: 'new' },
        { $set: { name: 'New' }, $setOnInsert: { status: 'open' } },
        { upsert: true },
      )

      expect(count).toBe(1)
      const items = await collection.find({ name: 'New' }, { async: true }).fetch()
      expect(items).toHaveLength(1)
      expect(items[0].status).toBe('open')
    })

    it('inserts when a batch update matches nothing', async () => {
      const count = await collection.updateMany(
        { status: 'archived' },
        { $set: { name: 'New', status: 'archived' } },
        { upsert: true },
      )

      expect(count).toBe(1)
      expect(await collection.find({ status: 'archived' }, { async: true }).fetch())
        .toHaveLength(1)
    })

    it('inserts when a replace matches nothing', async () => {
      const count = await collection.replaceOne(
        { id: 'new' },
        { id: 'new', status: 'open', rank: 5, name: 'New' },
        { upsert: true },
      )

      expect(count).toBe(1)
      expect(await collection.find({ id: 'new' }, { async: true }).fetch()).toHaveLength(1)
    })

    it('does not insert when the update matched something', async () => {
      const count = await collection.updateOne(
        { id: 'a' },
        { $set: { name: 'Annabel' }, $setOnInsert: { status: 'fresh' } },
        { upsert: true },
      )

      expect(count).toBe(1)
      expect(await collection.find({}, { async: true }).fetch()).toHaveLength(2)
    })

    it('does not insert when upsert is not asked for', async () => {
      const count = await collection.updateOne({ id: 'new' }, { $set: { name: 'New' } })

      expect(count).toBe(0)
      expect(await collection.find({}, { async: true }).fetch()).toHaveLength(2)
    })
  })
})
