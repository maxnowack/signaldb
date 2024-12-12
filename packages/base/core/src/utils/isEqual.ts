/**
 * Compares two values for deep equality.
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 * @returns - Returns `true` if the two values are deeply equal, otherwise `false`.
 * @example
 * isEqual({ a: 1 }, { a: 1 }); // true
 * isEqual([1, 2], [1, 2]);     // true
 * isEqual(new Date(0), new Date(0)); // true
 * isEqual(/abc/, /abc/);       // true
 * isEqual({ a: 1 }, { a: 2 }); // false
 * isEqual(null, null);         // true
 */
export default function isEqual<T, K>(a: T, b: K): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof RegExp && b instanceof RegExp) return a.toString() === b.toString()
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (typeof a !== 'object') return false
  if (typeof b !== 'object') return false
  if (a === null) return false
  if (b === null) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!bKeys.includes(key)) return false
    if (!isEqual(a[key as keyof T], b[key as keyof K])) return false
  }
  return true
}
