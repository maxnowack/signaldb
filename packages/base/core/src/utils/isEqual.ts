/**
 * Compares two values for deep equality. Primitives are compared with `Object.is`, dates by
 * their time, regular expressions by their source and flags, and objects and arrays by their
 * own enumerable keys, recursively.
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 * @returns `true` if the two values are deeply equal, otherwise `false`.
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
  if ((typeof a !== 'object') || (typeof b !== 'object') || (a === null) || (b === null)) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!bKeys.includes(key) || !isEqual(a[key as keyof T], b[key as keyof K])) return false
  }
  return true
}
