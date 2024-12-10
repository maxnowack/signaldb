/* eslint-disable lines-between-class-members */

// implements methods from the array class used for data manipulation
export default abstract class MemoryAdapter<T = Record<string, any>> {
  abstract push(item: T): void
  abstract pop(): T | undefined
  abstract splice(start: number, deleteCount?: number, ...items: T[]): T[]
  abstract map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[]
  abstract find(predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined
  abstract filter(predicate: (value: T, index: number, array: T[]) => unknown): T[]
  abstract findIndex(predicate: (value: T, index: number, obj: T[]) => boolean): number
}
