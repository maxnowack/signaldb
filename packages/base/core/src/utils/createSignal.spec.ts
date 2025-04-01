// @vitest-environment happy-dom
import { vi, it, expect } from 'vitest'
import createReactivityAdapter from '../createReactivityAdapter'
import createSignal from './createSignal'

it('should return the initial value', () => {
  const depend = vi.fn()
  const notify = vi.fn()
  const reactivityAdapter = createReactivityAdapter({
    create: () => ({
      depend,
      notify,
    }),
  })
  const signal = createSignal(reactivityAdapter, 'initialValue')
  expect(signal.get()).toBe('initialValue')
  expect(depend).toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('should update the value', () => {
  const depend = vi.fn()
  const notify = vi.fn()
  const reactivityAdapter = createReactivityAdapter({
    create: () => ({
      depend,
      notify,
    }),
  })
  const signal = createSignal(reactivityAdapter, 'initialValue')
  signal.set('newValue')
  expect(notify).toHaveBeenCalled()
  expect(signal.get()).toBe('newValue')
  expect(depend).toHaveBeenCalled()
})

it('should not notify dependency if value is equal', () => {
  const depend = vi.fn()
  const notify = vi.fn()
  const reactivityAdapter = createReactivityAdapter({
    create: () => ({
      depend,
      notify,
    }),
  })
  const signal = createSignal(reactivityAdapter, 'initialValue')
  signal.set('initialValue')
  expect(depend).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('should notify dependency if value is not equal', () => {
  const depend = vi.fn()
  const notify = vi.fn()
  const reactivityAdapter = createReactivityAdapter({
    create: () => ({
      depend,
      notify,
    }),
  })
  const signal = createSignal(reactivityAdapter, 'initialValue')
  signal.set('newValue')
  expect(depend).not.toHaveBeenCalled()
  expect(notify).toHaveBeenCalled()
})

it('should use custom isEqual function', () => {
  const depend = vi.fn()
  const notify = vi.fn()
  const reactivityAdapter = createReactivityAdapter({
    create: () => ({
      depend,
      notify,
    }),
  })
  const isEqual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const signal = createSignal<string>(reactivityAdapter, 'initialValue', isEqual)
  signal.set('INITIALVALUE')
  expect(notify).not.toHaveBeenCalled()
  expect(signal.get()).toBe('initialValue')
  expect(depend).toHaveBeenCalled()
})

it('should not depend if called outside scope', () => {
  const depend = vi.fn()
  const notify = vi.fn()
  const reactivityAdapter = createReactivityAdapter({
    create: () => ({
      depend,
      notify,
    }),
    isInScope: () => false,
  })
  const signal = createSignal(reactivityAdapter, 'initialValue')
  signal.set('newValue')
  expect(depend).not.toHaveBeenCalled()
  expect(signal.get()).toBe('newValue')
  expect(depend).not.toHaveBeenCalled()
  expect(notify).toHaveBeenCalled()
})
