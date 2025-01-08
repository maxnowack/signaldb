/**
 * Sets a value at a specified path within an object. Creates nested structures
 * (arrays or objects) as needed to set the value at the correct location. Supports
 * deleting the key if the value is `undefined` and the `deleteIfUndefined` flag is set to `true`.
 * @template T - The type of the object to modify.
 * @template K - The type of the value to set.
 * @param obj - The object to modify. The object is mutated directly.
 * @param path - The path (dot or bracket notation) where the value should be set.
 * @param value - The value to set at the specified path.
 * @param deleteIfUndefined - A boolean indicating whether to delete the key if the value is `undefined` (default: `false`).
 * @returns The modified object.
 */
export default function set<T extends object, K>(
  obj: T,
  path: string,
  value: K,
  deleteIfUndefined = false,
): T {
  if (obj == null) return obj
  const segments = path.split(/[.[\]]/g)
  if (segments[0] === '') segments.shift()
  if (segments[segments.length - 1] === '') segments.pop()

  const apply = (node: any) => {
    if (segments.length > 1) {
      const key = segments.shift() as string
      const nextIsNum = !Number.isNaN(parseInt(segments[0], 10))
      if (node[key] === undefined) {
        node[key] = nextIsNum ? [] : {}
      }
      apply(node[key])
    } else {
      if (deleteIfUndefined && value === undefined) {
        delete node[segments[0]]
        return
      }
      node[segments[0]] = value
    }
  }

  apply(obj)
  return obj
}
