export default function randomId() {
  return Math.floor(Math.random() * 1e17).toString(16)
}
