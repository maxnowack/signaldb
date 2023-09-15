interface Signal {
  depend(): void,
  notify(): void,
}

export default interface ReactivityAdapter {
  create(): Signal,
  onDispose?(callback: () => void): void,
  isInScope?(): boolean,
}
