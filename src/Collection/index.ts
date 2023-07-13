import type MemoryInterface from 'types/MemoryInterface'
import type ReactivityInterface from 'types/ReactivityInterface'
import type PersistenceInterface from 'types/PersistenceInterface'
import EventEmitter from 'types/EventEmitter'
import type Selector from 'types/Selector'
import type Modifier from 'types/Modifier'
import match from 'utils/match'
import modify from 'utils/modify'
import randomId from 'utils/randomId'
import Cursor from './Cursor'
import type { BaseItem, FindOptions, Transform } from './types'

export type { Transform, SortSpecifier, FieldSpecifier, FindOptions } from './types'
export type { CursorOptions } from './Cursor'
export type { ObserveCallbacks } from './Observer'

export interface CollectionOptions<T extends BaseItem<I>, I, U = T> {
  memory?: MemoryInterface,
  reactivity?: ReactivityInterface,
  transform?: Transform<T, U>,
  persistence?: PersistenceInterface<T, I>,
}

interface CollectionEvents<T> {
  added: (item: T) => void,
  changed: (item: T) => void,
  removed: (item: T) => void,

  'persistence.init': () => void,
  'persistence.error': (error: Error) => void,
  'persistence.transmitted': () => void,
  'persistence.received': () => void,
}

// eslint-disable-next-line max-len
export default class Collection<T extends BaseItem<I> = BaseItem, I = any, U = T> extends EventEmitter<CollectionEvents<T>> {
  private options: CollectionOptions<T, I, U>
  private persistenceAdapter: PersistenceInterface<T, I> | null = null

  constructor(options?: CollectionOptions<T, I, U>) {
    super()
    this.options = { memory: [], ...options }
    if (this.options.persistence) {
      const persistenceAdapter = this.options.persistence
      this.persistenceAdapter = persistenceAdapter
      const loadPersistentData = async () => {
        // load items from persistence adapter and push them into memory
        const { items } = await persistenceAdapter.load()
        // push new items to this.memory() and delete old ones
        this.memory().splice(0, this.memoryArray().length, ...items)

        this.emit('persistence.received')
      }

      persistenceAdapter.register(() => loadPersistentData())
        .then(async () => {
          await loadPersistentData()
          this.on('added', (item) => {
            persistenceAdapter.save(this.memory().map(i => i), {
              added: [item],
              modified: [],
              removed: [],
            }).then(() => {
              this.emit('persistence.transmitted')
            }).catch((error) => {
              this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
            })
          })
          this.on('changed', (item) => {
            persistenceAdapter.save(this.memory().map(i => i), {
              added: [],
              modified: [item],
              removed: [],
            }).then(() => {
              this.emit('persistence.transmitted')
            }).catch((error) => {
              this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
            })
          })
          this.on('removed', (item) => {
            persistenceAdapter.save(this.memory().map(i => i), {
              added: [],
              modified: [],
              removed: [item],
            }).then(() => {
              this.emit('persistence.transmitted')
            }).catch((error) => {
              this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
            })
          })

          this.emit('persistence.init')
        })
        .catch((error) => {
          this.emit('persistence.error', error instanceof Error ? error : new Error(error as string))
        })
    }
  }

  private getItemAndIndex(selector: Selector<T>) {
    const item = this.memory().find(doc => match(doc, selector))
    const index = this.memory().findIndex(doc => doc === item)
    if (item == null) return { item: null, index: -1 }
    if (index === -1) throw new Error('Cannot resolve index for item')
    return { item, index }
  }

  private memory() {
    return this.options.memory as NonNullable<MemoryInterface<T>>
  }

  private memoryArray() {
    return this.memory().map(item => item)
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

  public find<O extends FindOptions<T>>(selector?: Selector<T>, options?: O) {
    const cursorOptions = {
      reactive: this.options.reactivity,
      ...options,
      transform: this.transform.bind(this),
    }
    const cursor = new Cursor<T, U>(() => this.getItems(), selector || {}, cursorOptions)
    if (cursorOptions.reactive) {
      const requery = () => cursor.requery()
      this.on('persistence.received', requery)
      this.on('added', requery)
      this.on('changed', requery)
      this.on('removed', requery)
      const cleanup = () => {
        this.off('persistence.received', requery)
        this.off('added', requery)
        this.off('changed', requery)
        this.off('removed', requery)
      }
      cursor.onCleanup(cleanup)
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
    return newItem.id
  }

  public updateOne(selector: Selector<T>, modifier: Modifier<T>) {
    const { item, index } = this.getItemAndIndex(selector)
    if (item == null) return 0
    const modifiedItem = modify(item, modifier)
    this.memory().splice(index, 1, modifiedItem)
    this.emit('changed', modifiedItem)
    return 1
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
    return modifiedItems.length
  }

  public removeOne(selector: Selector<T>) {
    if (!selector) return 0
    const { item, index } = this.getItemAndIndex(selector)
    if (item == null) return 0
    this.memory().splice(index, 1)
    this.emit('removed', item)
    return 1
  }

  public removeMany(selector: Selector<T>) {
    if (!selector) return 0
    const items = this.getItems(selector)

    items.forEach((item) => {
      const index = this.memory().findIndex(doc => doc === item)
      if (index === -1) throw new Error('Cannot resolve index for item')
      this.memory().splice(index, 1)
    })

    items.forEach((item) => {
      this.emit('removed', item)
    })
    return items.length
  }
}
