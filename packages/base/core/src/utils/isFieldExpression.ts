import type { FieldExpression } from '../types/Selector'

const expressionKeys = new Set([
  '$eq',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$ne',
  '$exists',
  '$not',
  '$expr',
  '$jsonSchema',
  '$mod',
  '$regex',
  '$options',
  '$text',
  '$where',
  '$all',
  '$elemMatch',
  '$size',
  '$bitsAllClear',
  '$bitsAllSet',
  '$bitsAnyClear',
  '$bitsAnySet',
])

/**
 * Determines whether a given object is a valid field expression.
 * A field expression is an object containing query operators supported by MongoDB-style queries.
 * @template T - The type of the field expression.
 * @param expression - The object to test.
 * @returns A boolean indicating whether the object is a valid field expression.
 *   - `true` if the object contains only recognized query operators.
 *   - `false` otherwise.
 */
export default function isFieldExpression<T>(expression: any): expression is FieldExpression<T> {
  if (typeof expression !== 'object' || expression == null) {
    return false
  }

  const keys = Object.keys(expression as object)
  if (keys.length === 0) {
    return false
  }

  const hasInvalidKeys = keys.some(key => !expressionKeys.has(key))
  if (hasInvalidKeys) return false

  const hasValidKeys = keys.every(key => expressionKeys.has(key))
  return hasValidKeys
}
