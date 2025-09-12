/**
 * creates a random id
 * @returns a random string of 16 characters
 * @example
 * randomId() // '1234567890abcdef'
 */
export default function randomId() {
  return Array.from({ length: 16 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
  ).join('')
}
