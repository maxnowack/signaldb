export default interface Dependency {
  depend(): void,
  notify(): void,
}
