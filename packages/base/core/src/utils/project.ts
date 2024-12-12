import get from './get'
import set from './set'

/**
 * Projects the fields of an object based on a specified fields configuration.
 * Supports inclusion (`1`) and exclusion (`0`) of specific fields. Creates a new object
 * with the desired fields included or excluded, based on the configuration.
 * @template T - The type of the object being projected.
 * @param item - The original object to project fields from.
 * @param fields - An object defining the fields to include (`1`) or exclude (`0`).
 *   - Keys are the field names, and values are either `1` (include) or `0` (exclude).
 * @returns A new object with the specified fields included or excluded.
 *   - If all fields are set to `0`, the excluded fields are removed from the result.
 *   - If fields are set to `1`, only the included fields are retained.
 */
export default function project<T extends Record<string, any>>(
  item: T,
  fields: { [P in keyof T]?: 0 | 1 } & Record<string, 0 | 1>,
) {
  const allFieldsDeactivated = Object.values(fields).every(value => value === 0)
  if (allFieldsDeactivated) {
    const result = { ...item }
    Object.keys(fields).forEach((key) => {
      const fieldValue = get(item, key)
      if (fieldValue === undefined) return
      set(result, key, undefined, true)
    })
    return result
  }
  const result = {} as T
  Object.entries(fields).forEach(([key, value]) => {
    const fieldValue = get(item, key)
    if (fieldValue === undefined) return
    if (fieldValue == null && value !== 1) return
    set(result, key, value === 1 ? fieldValue : undefined)
  })
  return result
}
