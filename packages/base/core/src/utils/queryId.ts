import type { QueryOptions } from '../DataAdapter'
import type Selector from '../types/Selector'
import objectId from './objectId'

/**
 * Generates a unique identifier for a query based on its selector and options.
 * @param selector - The selector object.
 * @param options - The query options object (optional).
 * @returns A unique identifier string for the query.
 */
export default function queryId(selector: Selector<any>, options?: QueryOptions<any>) {
  const selectorId = objectId(selector)
  const optionsId = options == null ? -1 : objectId(options)

  return `${selectorId}:${optionsId}`
}
