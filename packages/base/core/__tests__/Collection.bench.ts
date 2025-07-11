/* istanbul ignore file -- @preserve */
import { bench, describe } from 'vitest'
import { Collection, createIndex } from '../src'

describe('Collection benchmarks', () => {
  describe('id index', async () => {
    const col = new Collection<{ id: string, name: string, num: number }>()

    // create items
    await col.batch(async () => {
      for (let i = 0; i < 1000; i += 1) {
        await col.insert({ id: i.toString(), name: 'John', num: i })
      }
    })

    bench('with index', () => {
      col.findOne({ id: '100' })
      col.findOne({ id: '500' })
      col.findOne({ id: '999' })
    })

    bench('without index', () => {
      col.findOne({ num: 100 })
      col.findOne({ num: 500 })
      col.findOne({ num: 999 })
    })
  })

  describe('named index', async () => {
    const col1 = new Collection<{ id: string, name: string, num: number }>({
      indices: [createIndex('num')],
    })
    const col2 = new Collection<{ id: string, name: string, num: number }>()

    await Collection.batch(async () => {
      // create items
      for (let i = 0; i < 10_000; i += 1) {
        await col1.insert({ id: i.toString(), name: 'John', num: i })
        await col2.insert({ id: i.toString(), name: 'John', num: i })
      }
    })

    bench('with index', () => {
      col1.findOne({ num: 100 })
      col1.findOne({ num: 500 })
      col1.findOne({ num: 999 })
    })

    bench('without index', () => {
      col2.findOne({ num: 100 })
      col2.findOne({ num: 500 })
      col2.findOne({ num: 999 })
    })
  })

  describe('index null and undefined values', async () => {
    const col1 = new Collection<{ id: string, name: string, num?: number | null }>({
      indices: [createIndex('num')],
    })
    const col2 = new Collection<{ id: string, name: string, num?: number | null }>()

    await Collection.batch(async () => {
      // create items
      for (let i = 0; i < 10_000; i += 1) {
        await col1.insert({ id: i.toString(), name: 'John', num: i > 5000 ? i : undefined })
        await col2.insert({ id: i.toString(), name: 'John', num: i > 5000 ? i : undefined })
      }
    })

    bench('with index', () => {
      col1.findOne({ num: undefined })
      col1.findOne({ num: null })
      col1.findOne({ num: { $exists: false } })
    })

    bench('without index', () => {
      col2.findOne({ num: undefined })
      col2.findOne({ num: null })
      col2.findOne({ num: { $exists: false } })
    })
  })
})
