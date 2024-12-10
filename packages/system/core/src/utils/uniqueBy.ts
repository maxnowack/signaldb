export default function uniqueBy<T>(arr: T[], fn: keyof T | ((item: T) => any)) {
  const set = new Set<any>()
  return arr.filter((el) => {
    const value = typeof fn === 'function' ? fn(el) : el[fn]
    return !set.has(value) && set.add(value)
  })
}
