type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T; // from lodash

function truthy<T>(value: T): value is Truthy<T> {
  return !!value
}

export default function compact<T>(array: T[]) {
  return array.filter(truthy)
}
