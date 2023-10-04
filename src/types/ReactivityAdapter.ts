export interface Dependency {
  depend(): void,
  notify(): void,
}

export default interface ReactivityAdapter<T extends Dependency = Dependency> {
  create(): T,
  onDispose?(callback: () => void, Dependency: T): void,
  isInScope?(): boolean,
}
