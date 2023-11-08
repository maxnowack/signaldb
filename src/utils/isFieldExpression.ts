import type { FieldExpression } from '../types/Selector'

const expressionKeys = [
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
]

export default function isFieldExpression<T>(expression: any): expression is FieldExpression<T> {
  if (typeof expression !== 'object' || expression == null) {
    return false
  }

  const keys = Object.keys(expression as object)
  if (keys.length === 0) {
    return false
  }

  const hasInvalidKeys = keys.some(key => !expressionKeys.includes(key))
  if (hasInvalidKeys) return false

  const hasValidKeys = keys.every(key => expressionKeys.includes(key))
  return hasValidKeys
}
