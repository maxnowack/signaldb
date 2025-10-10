const objectHashMap = new WeakMap<object, number>()
let nextId = 1

/**
 * Generates a unique identifier for the given object.
 * The same object will always receive the same identifier during its lifetime.
 * Different objects will receive different identifiers.
 * @param object - The object to generate an identifier for.
 * @returns A unique identifier for the object.
 */
export default function objectId(object: object): number {
  if (typeof object !== 'object' || object === null) {
    throw new TypeError('Expected a non-null object')
  }

  if (!objectHashMap.has(object)) {
    objectHashMap.set(object, nextId++)
  }

  return objectHashMap.get(object) as number
}
