import type Dependency from './Dependency'

export default interface ReactivityAdapter<T extends Dependency = Dependency> {
  create(): T,
  onDispose?(callback: () => void, Dependency: T): void,
  isInScope?(): boolean,
}
