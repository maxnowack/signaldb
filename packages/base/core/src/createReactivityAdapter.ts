import type Dependency from './types/Dependency'
import type ReactivityAdapter from './types/ReactivityAdapter'

/**
 * Creates an ReactivityAdapter based on the given definition.
 * @param definition - The definition of the ReactivityAdapter.
 * @returns The created ReactivityAdapter.
 */
export default function createReactivityAdapter<T extends Dependency = Dependency>(
  definition: ReactivityAdapter<T>,
) {
  return definition
}
