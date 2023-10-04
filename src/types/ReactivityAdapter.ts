export interface Signal {
  depend(): void,
  notify(): void,
}

export default interface ReactivityAdapter<T extends Signal = Signal> {
  create(): T,
  onDispose?(callback: () => void, signal: T): void,
  isInScope?(): boolean,
}
