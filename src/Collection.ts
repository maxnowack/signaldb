import type MemoryInterface from 'types/MemoryInterface'
import EventEmitter from 'types/EventEmitter'
import type Selector from 'types/Selector'
import type Modifier from 'types/Modifier'
import match from 'utils/match'
import modify from 'utils/modify'
import randomId from 'utils/randomId'

interface Options {
  memory?: MemoryInterface,
}

interface CollectionEvents<T> {
  inserted: (item: T) => void,
  changed: (item: T) => void,
  removed: (item: T) => void,
}

export default class Collection<T extends Record<string, any> = Record<string, any>>
  extends EventEmitter<CollectionEvents<T>> {
  private memory: MemoryInterface<T>

  constructor(options: Options = {
    memory: [],
  }) {
    super()
    this.memory = options.memory as MemoryInterface<T> || []
  }

  private getItemAndIndex(selector: Selector<T>) {
    const item = this.memory.find(doc => match(doc, selector))
    const index = this.memory.findIndex(doc => doc === item)
    if (item == null) throw new Error('Cannot resolve item for selector')
    if (index === -1) throw new Error('Cannot resolve index for item')
    return { item, index }
  }

  public findOne(selector: Selector<T>) {
    return this.memory.find((item) => {
      const matches = match(item, selector)
      return matches
    })
  }

  public find(selector: Selector<T>) {
    return this.memory.filter((item) => {
      const matches = match(item, selector)
      return matches
    })
  }

  public insert(item: T) {
    const newItem = { id: randomId(), ...item }
    this.memory.push(newItem)
    this.emit('inserted', newItem)
  }

  public updateOne(selector: Selector<T>, modifier: Modifier<T>) {
    const { item, index } = this.getItemAndIndex(selector)
    const modifiedItem = modify(item, modifier)
    this.memory.splice(index, 1, modifiedItem)
    this.emit('changed', modifiedItem)
  }

  public updateMany(selector: Selector<T>, modifier: Modifier<T>) {
    const items = this.find(selector)
    const modifiedItems: T[] = []
    items.forEach((item) => {
      const index = this.memory.findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      const modifiedItem = modify(item, modifier)
      this.memory.splice(index, 1, modifiedItem)
      modifiedItems.push(modifiedItem)
    })
    modifiedItems.forEach((modifiedItem) => {
      this.emit('changed', modifiedItem)
    })
  }

  public removeOne(selector: Selector<T>) {
    const { item, index } = this.getItemAndIndex(selector)
    this.memory.splice(index, 1)
    this.emit('removed', item)
  }

  public removeMany(selector: Selector<T>) {
    const items = this.find(selector)

    items.forEach((item) => {
      const index = this.memory.findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      this.memory.splice(index, 1)
    })

    items.forEach((item) => {
      this.emit('removed', item)
    })
  }
}
