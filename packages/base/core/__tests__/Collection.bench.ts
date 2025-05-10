/* istanbul ignore file -- @preserve */
import { bench, describe } from 'vitest'
import { Collection, createIndex } from '../src'
import type { TransformAll, BaseItem } from '../src'

describe('Collection benchmarks', () => {
  describe('id index', () => {
    const col = new Collection<{ id: string, name: string, num: number }>()

    // create items
    col.batch(() => {
      for (let i = 0; i < 1000; i += 1) {
        col.insert({ id: i.toString(), name: 'John', num: i })
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

  describe('named index', () => {
    const col1 = new Collection<{ id: string, name: string, num: number }>({
      indices: [createIndex('num')],
    })
    const col2 = new Collection<{ id: string, name: string, num: number }>()

    Collection.batch(() => {
      // create items
      for (let i = 0; i < 10_000; i += 1) {
        col1.insert({ id: i.toString(), name: 'John', num: i })
        col2.insert({ id: i.toString(), name: 'John', num: i })
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
  describe('transformAll', () => {
    const col1 = new Collection()
    interface TestItem {
      id: number,
      parent?: any,
    }
    const transformAll: TransformAll<BaseItem, TestItem> = (items, fields) => {
      if (fields?.parent) {
        const foreignKeys = [...new Set(items.map(item => item.parent))]
        const relatedItems = col1.find({ id: { $in: foreignKeys } }).fetch()
        items.forEach((item) => {
          item.parent = relatedItems.find(related => related.id === item.parent)
        })
      }
      return items
    }
    const col2 = new Collection({ transformAll })

    Collection.batch(() => {
      // create items
      for (let i = 0; i < 10_000; i += 1) {
        col1.insert({ id: i.toString(), name: 'John Sr.', num: i })
        col2.insert({ id: i.toString(), name: 'John', parent: i.toString() })
      }
    })

    bench('default', () => {
      col2.find().map(value => value.parent = col1.findOne({ id: value.parent }))
    })

    bench('transformAll', () => {
      col2.find({}, { fields: { parent: 1 } }).fetch()
    })
  })
})
