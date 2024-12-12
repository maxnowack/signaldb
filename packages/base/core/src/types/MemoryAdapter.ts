/**
 * Abstract class representing a memory adapter that implements methods
 * from the JavaScript `Array` class for data manipulation.
 * Designed to be extended and customized for specific use cases.
 * @template T - The type of the items stored in the memory adapter (default is a record of key-value pairs).
 */
export default abstract class MemoryAdapter<T = Record<string, any>> {
  abstract push(item: T): void
  abstract pop(): T | undefined
  abstract splice(start: number, deleteCount?: number, ...items: T[]): T[]
  abstract map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[]
  abstract find(predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined
  abstract filter(predicate: (value: T, index: number, array: T[]) => unknown): T[]
  abstract findIndex(predicate: (value: T, index: number, obj: T[]) => boolean): number
}
