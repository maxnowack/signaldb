import type { QueryOptions } from '../DataAdapter'
import type Selector from '../types/Selector'

/**
 * Returns true when `options` is effectively "empty" for the purpose of queryId generation.
 * Treats `undefined`/`null` as empty, and only considers plain objects with zero own enumerable keys as empty.
 * Arrays and non-object values are not considered empty.
 * @param options - Query options to test.
 * @returns `true` if `options` is `null`/`undefined` or a plain object with no own keys; otherwise `false`.
 */
function isEmptyOptions(options?: QueryOptions<any>) {
  if (options == null) return true
  if (typeof options !== 'object') return false
  if (Array.isArray(options)) return false
  return Object.keys(options).length === 0
}

/**
 * Generates a unique identifier for a query based on its selector and options.
 * @param selector - The selector object.
 * @param options - The query options object (optional).
 * @returns A unique identifier string for the query.
 */
export default function queryId(selector: Selector<any>, options?: QueryOptions<any>) {
  const selectorId = JSON.stringify(selector)
  const optionsId = isEmptyOptions(options) ? -1 : JSON.stringify(options)

  return `${selectorId}:${optionsId}`
}
