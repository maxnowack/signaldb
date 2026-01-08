/**
 * Performs a deep clone of a value, supporting various types including arrays, objects,
 * Maps, Sets, Dates, and RegExps. Functions are not supported and will throw an error.
 * @template T - The type of the value to clone.
 * @param value - The value to deep clone.
 * @returns A deep copy of the provided value.
 * @throws {Error} An error if the value is a function, as cloning functions is not supported.
 */
export function clone<T>(value: T): T {
  // Functions
  if (typeof value === 'function') throw new Error('Cloning functions is not supported')

  // Check for null or primitive types (string, number, boolean, etc.)
  if (value === null || typeof value !== 'object') return value

  // Dates
  if (value instanceof Date) return new Date(value) as T

  // Arrays
  if (Array.isArray(value)) return value.map(item => clone(item)) as T

  // Maps
  if (value instanceof Map) {
    const result = new Map()
    value.forEach((currentValue, key) => {
      result.set(key, clone(currentValue))
    })
    return result as T
  }

  // Sets
  if (value instanceof Set) {
    const result = new Set()
    value.forEach((currentValue) => {
      result.add(clone(currentValue))
    })
    return result as T
  }

  // RegExp
  if (value instanceof RegExp) return new RegExp(value) as T

  // plain objects
  const result: any = {}
  for (const key in value) {
    if (Object.hasOwnProperty.call(value, key)) {
      result[key] = clone(value[key])
    }
  }
  return result
}

/**
 * Creates a deep clone of an object. Uses the `structuredClone` function if available,
 * otherwise falls back to a manual deep clone implementation.
 * @template T - The type of the object to clone.
 * @param object - The object to deep clone.
 * @returns A deep copy of the provided object.
 */
export default function deepClone<T>(object: T): T {
  // If structuredClone is available, use it
  if (typeof structuredClone === 'function') return structuredClone(object)

  // Otherwise, perform a manual deep clone
  /* istanbul ignore next -- @preserve */
  return clone(object)
}
