/**
 * Orders two strings by their UTF-16 code units, exactly like `Array#sort()` without a compare
 * function does.
 * @param left - The first string.
 * @param right - The second string.
 * @returns A negative number, zero or a positive number.
 */
export default function compareCodeUnits(left: string, right: string) {
  return Number(left > right) - Number(left < right)
}
