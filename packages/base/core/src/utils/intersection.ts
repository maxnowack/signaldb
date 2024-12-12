/**
 * Computes the intersection of multiple arrays, returning an array of unique elements
 * that are present in all the input arrays.
 * @template T - The type of elements in the arrays.
 * @param arrays - A variable number of arrays to compute the intersection of.
 * @returns An array containing the unique elements found in all the input arrays.
 *   - If no arrays are provided, returns an empty array.
 */
export default function intersection<T>(...arrays: T[][]) {
  if (arrays.length === 0) return []
  return [...new Set(arrays.reduce((a, b) => a.filter(c => b.includes(c))))]
}
