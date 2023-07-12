import EventEmitter from 'types/EventEmitter'
import type Selector from 'types/Selector'
import sortItems from 'utils/sortItems'
import project from 'utils/project'
import match from 'utils/match'
import type { BaseItem, FindOptions, Transform } from './types'

interface CursorOptions<T extends BaseItem, U = T> extends FindOptions<T> {
  transform?: Transform<T, U>,
}

interface CursorEvents<T> {
  added: (item: T) => void,
  addedBefore: (item: T, before: T) => void,
  changed: (item: T) => void,
  movedBefore: (item: T, before: T) => void,
  removed: (item: T) => void,
}

export default class Cursor<T extends BaseItem, U = T> extends EventEmitter<CursorEvents<T>> {
  private getAllItems: () => T[]
  private selector: Selector<T>
  private options: CursorOptions<T, U>

  constructor(
    getAllItems: () => T[],
    selector: Selector<T>,
    options?: CursorOptions<T, U>,
  ) {
    super()
    this.getAllItems = getAllItems
    this.selector = selector
    this.options = options || {}
  }

  private filterItems(items: T[]) {
    const { selector } = this
    return items.filter((item) => {
      if (!selector) return true
      const matches = match(item, selector)
      return matches
    })
  }

  private transform(item: T): U {
    const projected = !this.options.fields ? item : project(item, this.options.fields)
    if (!this.options.transform) return projected as unknown as U
    return this.options.transform(projected)
  }

  private getItems() {
    const allItems = this.getAllItems()
    const filtered = this.filterItems(allItems)
    const { sort, skip, limit } = this.options
    const sorted = sort ? sortItems(filtered, sort) : filtered
    const skipped = skip ? sorted.slice(skip) : sorted
    const limited = limit ? skipped.slice(0, limit) : skipped
    return limited
  }

  public fetch(): U[] {
    const items = this.getItems()
    return items.map(item => this.transform(item))
  }

  public count() {
    const items = this.getItems()
    return items.length
  }
}
