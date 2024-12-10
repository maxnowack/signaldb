// @vitest-environment happy-dom
import { vi, it, expect } from 'vitest'
import type Dependency from '../types/Dependency'
import createSignal from './createSignal'

it('should return the initial value', () => {
  const dependency = {
    depend: vi.fn(),
    notify: vi.fn(),
  } as Dependency
  const signal = createSignal(dependency, 'initialValue')
  expect(signal.get()).toBe('initialValue')
  expect(dependency.depend).toHaveBeenCalled()
  expect(dependency.notify).not.toHaveBeenCalled()
})

it('should update the value', () => {
  const dependency = {
    depend: vi.fn(),
    notify: vi.fn(),
  } as Dependency
  const signal = createSignal(dependency, 'initialValue')
  signal.set('newValue')
  expect(dependency.notify).toHaveBeenCalled()
  expect(signal.get()).toBe('newValue')
  expect(dependency.depend).toHaveBeenCalled()
})

it('should not notify dependency if value is equal', () => {
  const dependency = {
    depend: vi.fn(),
    notify: vi.fn(),
  } as Dependency
  const signal = createSignal(dependency, 'initialValue')
  signal.set('initialValue')
  expect(dependency.depend).not.toHaveBeenCalled()
  expect(dependency.notify).not.toHaveBeenCalled()
})

it('should notify dependency if value is not equal', () => {
  const dependency = {
    depend: vi.fn(),
    notify: vi.fn(),
  } as Dependency
  const signal = createSignal(dependency, 'initialValue')
  signal.set('newValue')
  expect(dependency.depend).not.toHaveBeenCalled()
  expect(dependency.notify).toHaveBeenCalled()
})

it('should use custom isEqual function', () => {
  const dependency = {
    depend: vi.fn(),
    notify: vi.fn(),
  } as Dependency
  const isEqual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const signal = createSignal<string>(dependency, 'initialValue', isEqual)
  signal.set('INITIALVALUE')
  expect(dependency.notify).not.toHaveBeenCalled()
  expect(signal.get()).toBe('initialValue')
  expect(dependency.depend).toHaveBeenCalled()
})
