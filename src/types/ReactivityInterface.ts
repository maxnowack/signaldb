interface Signal {
  depend(): void,
  notify(): void,
}

export default interface ReactivityInterface {
  create(): Signal,
  onDispose?(callback: () => void): void,
}
