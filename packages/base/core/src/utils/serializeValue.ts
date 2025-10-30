/**
 * Serializes a value into a string representation.
 * Handles various types, including strings, numbers, booleans, dates, and objects.
 * Falls back to JSON stringification for unsupported types.
 * @param value - The value to serialize.
 *   - Strings are returned as-is.
 *   - Numbers and booleans are converted to their string representation.
 *   - Dates are converted to ISO string format.
 *   - Other values are stringified using `JSON.stringify`.
 * @returns A string representation of the value.
 */
export default function serializeValue(value: any) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'boolean') return value.toString()
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}
