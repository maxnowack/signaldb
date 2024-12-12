/**
 * creates a random id
 * @returns a random string of 16 characters
 * @example
 * randomId() // '1234567890abcdef'
 */
export default function randomId() {
  return Math.floor(Math.random() * 1e17).toString(16)
}
