import type { BaseItem, Changeset, Modifier } from '@signaldb/core'

interface Insert<T extends BaseItem<I> = BaseItem, I = any> {
  type: 'insert',
  data: T,
}
interface Update<T extends BaseItem<I> = BaseItem, I = any> {
  type: 'update',
  data: { id: I, modifier: Modifier<T> },
}
interface Remove<IdType> {
  type: 'remove',
  data: IdType,
}
export type Change<T extends BaseItem<I> = BaseItem, I = any> = {
  id: string,
  time: number,
  collectionName: string,
} & (Insert<T, I> | Update<T, I> | Remove<I>)

export interface Snapshot<T extends BaseItem<I> = BaseItem, I = any> {
  id: string,
  time: number,
  collectionName: string,
  items: T[],
}

export type SyncOperation = {
  id: string,
  start: number,
  collectionName: string,
  instanceId: string,
} & ({
  status: 'active',
  end?: never,
  error?: never,
} | {
  status: 'done',
  end: number,
  error?: never,
} | {
  status: 'error',
  end: number,
  error: any,
})

export type LoadResponse<T> = {
  items: T[],
  changes?: never,
} | {
  changes: Changeset<T>,
  items?: never,
}
