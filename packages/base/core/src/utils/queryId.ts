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

// Stands in for absent options so they can be a `WeakMap` key like any other pair half.
const noOptions = {}

// Ids are asked for far more often than queries are created — every cursor read resolves its query
// through one, and a single `postMessage` round trip goes through several. Serializing the same two
// objects over and over is pure waste, so a pair of objects that has been seen before answers from
// here. Keyed weakly on both halves: an entry lives exactly as long as the objects it describes,
// and a selector built fresh at the call site simply misses and is collected again.
//
// The cache assumes a selector or options object is not mutated after it has been used to identify
// a query. That already holds today for a different reason — a query is registered, cached and
// looked up under the id its selector had at registration time, so mutating it afterwards loses the
// query either way.
const cache = new WeakMap<object, WeakMap<object, string>>()

/**
 * Generates a unique identifier for a query based on its selector and options.
 * @param selector - The selector object.
 * @param options - The query options object (optional).
 * @returns A unique identifier string for the query.
 */
export default function queryId(selector: Selector<any>, options?: QueryOptions<any>) {
  const isCacheable = selector != null && typeof selector === 'object'
    && (options == null || typeof options === 'object')
  if (!isCacheable) {
    const optionsId = isEmptyOptions(options) ? -1 : JSON.stringify(options)
    return `${JSON.stringify(selector)}:${optionsId}`
  }

  const optionsKey = (options ?? noOptions) as object
  const cachedForSelector = cache.get(selector as object)
  const cached = cachedForSelector?.get(optionsKey)
  if (cached != null) return cached

  const selectorId = JSON.stringify(selector)
  const optionsId = isEmptyOptions(options) ? -1 : JSON.stringify(options)
  const id = `${selectorId}:${optionsId}`

  if (cachedForSelector) {
    cachedForSelector.set(optionsKey, id)
  } else {
    cache.set(selector as object, new WeakMap<object, string>([[optionsKey, id]]))
  }
  return id
}
