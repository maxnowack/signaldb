export default interface Signal<T> {
  get(): T,
  set(value: T): void,
}
