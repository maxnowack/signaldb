/**
 * Serializes a value into the string SignalDB uses as a map key, e.g. for ids and index entries.
 * - `null` and `undefined` become `null`.
 * - Strings are returned as-is.
 * - Numbers and booleans are converted to their string representation.
 * - Dates are converted to ISO string format.
 * - Other values are stringified using `JSON.stringify`.
 *
 * Different values can therefore share a key: `3` and `'3'` both serialize to `'3'`.
 * @param value - The value to serialize.
 * @returns A string representation of the value, or `null` for `null` and `undefined`.
 */
export default function serializeValue(value: any) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'boolean') return value.toString()
  return value instanceof Date ? value.toISOString() : JSON.stringify(value)
}
