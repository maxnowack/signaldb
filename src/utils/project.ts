import get from './get'
import set from './set'

export default function project<T extends Record<string, any>>(
  item: T,
  fields: { [P in keyof T]?: 0 | 1 } & Record<string, 0 | 1>,
) {
  const result = {} as T
  Object.entries(fields).forEach(([key, value]) => {
    const fieldValue = get(item, key)
    if (fieldValue === undefined) return
    if (fieldValue == null && value !== 1) return
    set(result, key, value === 1 ? fieldValue : undefined)
  })
  return result
}
