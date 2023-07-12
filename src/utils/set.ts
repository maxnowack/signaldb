/* eslint-disable no-param-reassign */
export default function set<T extends object, K>(
  obj: T,
  path: string,
  value: K,
): T {
  if (obj == null) return obj
  const segments = path.split(/[.[\]]/g)
  if (segments[0] === '') segments.shift()
  if (segments[segments.length - 1] === '') segments.pop()

  const apply = (node: any) => {
    if (segments.length > 1) {
      const key = segments.shift() as string
      const nextIsNum = !Number.isNaN(parseInt(segments[0], 10))
      if (node[key] === undefined) {
        node[key] = nextIsNum ? [] : {}
      }
      apply(node[key])
    } else {
      node[segments[0]] = value
    }
  }

  apply(obj)
  return obj
}
