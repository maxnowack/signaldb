export default function intersection<T>(...arrays: T[][]) {
  if (arrays.length === 0) return []
  return [...new Set(arrays.reduce((a, b) => a.filter(c => b.includes(c))))]
}
