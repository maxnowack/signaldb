import type MemoryInterface from 'types/MemoryInterface'
import type ReactivityInterface from 'types/ReactivityInterface'
import EventEmitter from 'types/EventEmitter'
import type Selector from 'types/Selector'
import type Modifier from 'types/Modifier'
import match from 'utils/match'
import modify from 'utils/modify'
import randomId from 'utils/randomId'
import Cursor from './Cursor'
import type { BaseItem, FindOptions, Transform } from './types'

interface Options<T extends BaseItem, U = T> {
  memory?: MemoryInterface,
  reactivity?: ReactivityInterface,
  transform?: Transform<T, U>,
}

interface CollectionEvents<T> {
  added: (item: T) => void,
  changed: (item: T) => void,
  removed: (item: T) => void,
}

// eslint-disable-next-line max-len
export default class Collection<T extends BaseItem = BaseItem, U = T> extends EventEmitter<CollectionEvents<T>> {
  private options: Options<T, U>

  constructor(options?: Options<T, U>) {
    super()
    this.options = { memory: [], ...options }
  }

  private getItemAndIndex(selector: Selector<T>) {
    const item = this.memory().find(doc => match(doc, selector))
    const index = this.memory().findIndex(doc => doc === item)
    if (item == null) throw new Error('Cannot resolve item for selector')
    if (index === -1) throw new Error('Cannot resolve index for item')
    return { item, index }
  }

  private memory() {
    return this.options.memory as NonNullable<MemoryInterface<T>>
  }

  private transform(item: T): U {
    if (!this.options.transform) return item as unknown as U
    return this.options.transform(item)
  }

  public getItems(selector?: Selector<T>) {
    return this.memory().filter((item) => {
      if (!selector) return true
      const matches = match(item, selector)
      return matches
    })
  }

  public getItem(selector: Selector<T>) {
    return this.memory().find((item) => {
      const matches = match(item, selector)
      return matches
    })
  }

  public find<O extends FindOptions<T>>(selector?: Selector<T>, options?: O) {
    const cursorOptions = {
      reactive: this.options.reactivity,
      ...options,
      transform: this.transform.bind(this),
    }
    const cursor = new Cursor<T, U>(() => this.getItems(), selector || {}, cursorOptions)
    if (this.options.reactivity && cursorOptions.reactive) {
      const requery = () => cursor.requery()
      this.on('added', requery)
      this.on('changed', requery)
      this.on('removed', requery)
      this.options.reactivity.onDispose(() => {
        this.off('added', requery)
        this.off('changed', requery)
        this.off('removed', requery)
      })
    }
    return cursor
  }

  public findOne<O extends Omit<FindOptions<T>, 'limit'>>(selector: Selector<T>, options?: O) {
    const cursor = this.find(selector, {
      limit: 1,
      ...options,
    })
    return cursor.fetch()[0]
  }

  public insert(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) {
    const newItem = { id: randomId(), ...item } as T
    this.memory().push(newItem)
    this.emit('added', newItem)
  }

  public updateOne(selector: Selector<T>, modifier: Modifier<T>) {
    const { item, index } = this.getItemAndIndex(selector)
    const modifiedItem = modify(item, modifier)
    this.memory().splice(index, 1, modifiedItem)
    this.emit('changed', modifiedItem)
  }

  public updateMany(selector: Selector<T>, modifier: Modifier<T>) {
    const items = this.getItems(selector)
    const modifiedItems: T[] = []
    items.forEach((item) => {
      const index = this.memory().findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      const modifiedItem = modify(item, modifier)
      this.memory().splice(index, 1, modifiedItem)
      modifiedItems.push(modifiedItem)
    })
    modifiedItems.forEach((modifiedItem) => {
      this.emit('changed', modifiedItem)
    })
  }

  public removeOne(selector: Selector<T>) {
    const { item, index } = this.getItemAndIndex(selector)
    this.memory().splice(index, 1)
    this.emit('removed', item)
  }

  public removeMany(selector: Selector<T>) {
    const items = this.getItems(selector)

    items.forEach((item) => {
      const index = this.memory().findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      this.memory().splice(index, 1)
    })

    items.forEach((item) => {
      this.emit('removed', item)
    })
  }
}
