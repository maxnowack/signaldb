/**
 * Retrieves the value at a specified path within an object.
 * Supports dot and bracket notation for navigating nested properties.
 * @template T - The type of the object to retrieve the value from.
 * @param value - The object to navigate.
 * @param path - The path (dot or bracket notation) to the desired value.
 * @returns The value at the specified path, or `undefined` if the path does not exist.
 */
export default function get<T extends Record<string, any>>(value: T, path: string) {
  const normalized = path.replaceAll(/\[(\w+)\]/g, '.$1')

  if (normalized.includes('..') || normalized.startsWith('.') || normalized.endsWith('.')) {
    return
  }

  const segments = normalized.split('.')

  let current: any = value
  for (const key of segments) {
    if (current == null) return
    current = current[key]
  }
  if (current === undefined) return
  return current
}
