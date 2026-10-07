import type Dependency from './Dependency'

/**
 * Connects SignalDB to a reactivity library. Create one with `createReactivityAdapter`.
 * @template T - The dependency type the library produces.
 */
export default interface ReactivityAdapter<T extends Dependency = Dependency> {
  /**
   * Creates a dependency: an object whose `depend()` registers the current reactive scope on it
   * and whose `notify()` wakes every scope registered that way.
   */
  create(): T,
  /**
   * Registers a callback to run when the reactive scope that depended on `Dependency` is
   * disposed. SignalDB stops observing the query then; without this member, the observation lasts until the
   * cursor's `cleanup()` is called.
   */
  onDispose?(callback: () => void, Dependency: T): void,
  /**
   * Returns whether the code currently runs inside a reactive scope. Takes no parameter. Without
   * this member, every call is assumed to be in scope.
   */
  isInScope?(): boolean,
}
