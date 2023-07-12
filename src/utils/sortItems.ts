import { sort } from 'fast-sort'
import get from 'utils/get'

export default function sortItems<T extends Record<string, any>>(
  items: T[],
  sortFields: { [P in keyof T]?: -1 | 1 } & Record<string, -1 | 1>,
) {
  return sort(items).by(Object.entries(sortFields).map(([key, value]) => {
    const order = value === 1 ? 'asc' : 'desc'
    return { [order]: (i: T) => get(i, key) } as Record<'asc' | 'desc', (i: T) => any>
  }))
}
