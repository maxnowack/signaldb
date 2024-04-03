import type Dependency from './types/Dependency'
import type ReactivityAdapter from './types/ReactivityAdapter'

export default function createReactivityAdapter<T extends Dependency = Dependency>(
  definition: ReactivityAdapter<T>,
) {
  return definition
}
