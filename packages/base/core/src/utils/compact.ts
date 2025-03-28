type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T // from lodash

/**
 * Checks if a value is truthy.
 * @template T - The type of the value.
 * @param value - The value to check.
 * @returns A boolean indicating if the value is truthy.
 */
function truthy<T>(value: T): value is Truthy<T> {
  return !!value
}

/**
 * Filters out falsy values (`false`, `''`, `0`, `null`, `undefined`) from an array.
 * @template T - The type of the elements in the array.
 * @param array - The array to filter.
 * @returns A new array containing only the truthy values from the input array.
 */
export default function compact<T>(array: T[]) {
  return array.filter(truthy)
}
