import Collection from 'Collection'
import type { Transform } from 'Collection/types'

describe('Cursor', () => {
  interface TestItem {
    id: number,
    name: string,
  }

  const items: TestItem[] = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
    { id: 3, name: 'Item 3' },
  ]

  const collection = new Collection<TestItem>()
  items.forEach(item => collection.insert(item))

  const transform: Transform<TestItem, { id: number }> = item => ({ id: item.id })

  describe('fetch', () => {
    it('should return transformed items when transform function is provided', () => {
      const col = new Collection({ transform })
      items.forEach(item => col.insert(item))
      const cursor = col.find({})
      const result = cursor.fetch()
      const expected = items.map(item => ({ id: item.id }))
      expect(result).toEqual(expected)
    })

    it('should return all items when no selector or options are provided', () => {
      const cursor = collection.find()
      const result = cursor.fetch()
      expect(result).toEqual(items)
    })

    it('should return filtered items when selector is provided', () => {
      const cursor = collection.find({ id: 2 })
      const result = cursor.fetch()
      expect(result).toEqual([items[1]])
    })

    it('should return sorted items when sort option is provided', () => {
      const cursor = collection.find({}, { sort: { id: -1 } })
      const result = cursor.fetch()
      const expected = [...items].reverse()
      expect(result).toEqual(expected)
    })

    it('should return limited items when limit option is provided', () => {
      const cursor = collection.find({}, { limit: 2 })
      const result = cursor.fetch()
      const expected = items.slice(0, 2)
      expect(result).toEqual(expected)
    })

    it('should return skipped items when skip option is provided', () => {
      const cursor = collection.find({}, { skip: 1 })
      const result = cursor.fetch()
      const expected = items.slice(1)
      expect(result).toEqual(expected)
    })

    it('should return projected, sorted, limited, and skipped items when options are provided', () => {
      const cursor = collection.find({
        id: { $gt: 1 },
      }, {
        sort: { id: 1 },
        limit: 1,
        skip: 1,
        fields: { id: 1 },
      })
      const result = cursor.fetch()
      const expected = [{ id: 3 }]
      expect(result).toEqual(expected)
    })
  })

  describe('count', () => {
    it('should return the total count of items when no selector is provided', () => {
      const cursor = collection.find()
      const result = cursor.count()
      expect(result).toEqual(items.length)
    })

    it('should return the count of filtered items when selector is provided', () => {
      const cursor = collection.find({ id: 2 })
      const result = cursor.count()
      expect(result).toEqual(1)
    })

    it('should return the count of transformed items when transform function is provided', () => {
      const col = new Collection({ transform })
      items.forEach(item => col.insert(item))
      const cursor = col.find({ id: 2 })
      const result = cursor.count()
      expect(result).toEqual(1)
    })

    it('should return the count of sorted, limited, and skipped items when options are provided', () => {
      const cursor = collection.find({ id: { $gt: 1 } }, { sort: { id: 1 }, limit: 1, skip: 1 })
      const result = cursor.count()
      expect(result).toEqual(1)
    })
  })
})
