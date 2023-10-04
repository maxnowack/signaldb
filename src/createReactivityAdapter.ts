import type ReactivityAdapter from './types/ReactivityAdapter'
import type { Signal } from './types/ReactivityAdapter'

export default function createReactivityAdapter<T extends Signal = Signal>(
  definition: ReactivityAdapter<T>,
) {
  return definition
}
