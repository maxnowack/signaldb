/**
 * Filters an array to ensure unique values based on a specified key or transformation function.
 * @template T - The type of the elements in the array.
 * @param arr - The array to filter for unique values.
 * @param fn - A key or transformation function to determine uniqueness.
 *   - If a key is provided, it will use the corresponding property of each element for uniqueness.
 *   - If a function is provided, it will use the return value of the function applied to each element for uniqueness.
 * @returns A new array containing only unique elements based on the specified key or transformation.
 */
export default function uniqueBy<T>(arr: T[], fn: keyof T | ((item: T) => any)) {
  const set = new Set<any>()
  return arr.filter((el) => {
    const value = typeof fn === 'function' ? fn(el) : el[fn]
    return !set.has(value) && set.add(value)
  })
}
