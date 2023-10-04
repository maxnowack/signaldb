import type ReactivityAdapter from './types/ReactivityAdapter'
import type { Dependency } from './types/ReactivityAdapter'

export default function createReactivityAdapter<T extends Dependency = Dependency>(
  definition: ReactivityAdapter<T>,
) {
  return definition
}
