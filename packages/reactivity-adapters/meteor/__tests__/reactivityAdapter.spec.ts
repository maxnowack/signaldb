import { describe, it, expect, vi } from 'vitest'
import { Tracker as MeteorTracker, Dependency as BaseDependency } from 'meteor-ts-tracker'
import createMeteorReactivityAdapter from '../src/index'

type TrackerLike = typeof MeteorTracker

const buildTracker = () => {
  const dependSpy = vi.fn()
  const changedSpy = vi.fn()

  class LocalDependency extends BaseDependency {
    constructor() {
      super()
    }

    depend(...args: Parameters<BaseDependency['depend']>) {
      dependSpy()
      return super.depend(...args)
    }

    changed(...args: Parameters<BaseDependency['changed']>) {
      changedSpy()
      super.changed(...args)
    }
  }

  const tracker: TrackerLike = {
    ...MeteorTracker,
    Dependency: LocalDependency as TrackerLike['Dependency'],
    active: true,
    onInvalidate: vi.fn(((callback) => {
      const computation = new MeteorTracker.Computation(() => {}, null)
      callback(computation)
    }) as TrackerLike['onInvalidate']),
  }

  return { tracker, dependSpy, changedSpy }
}

describe('createMeteorReactivityAdapter', () => {
  it('wires dependencies when tracker is active', () => {
    const { tracker, dependSpy, changedSpy } = buildTracker()
    const adapter = createMeteorReactivityAdapter(tracker)
    const signal = adapter.create()

    signal.depend()
    expect(dependSpy).toHaveBeenCalled()

    signal.notify()
    expect(changedSpy).toHaveBeenCalled()
    expect(adapter.isInScope?.()).toBe(true)

    const dispose = vi.fn()
    adapter.onDispose?.(dispose, signal)
    expect(tracker.onInvalidate).toHaveBeenCalledWith(dispose)
  })

  it('skips dependency wiring when tracker is inactive', () => {
    const { tracker, dependSpy, changedSpy } = buildTracker()
    tracker.active = false
    const adapter = createMeteorReactivityAdapter(tracker)
    const signal = adapter.create()

    signal.depend()
    signal.notify()
    expect(dependSpy).not.toHaveBeenCalled()
    expect(changedSpy).toHaveBeenCalled()
    adapter.onDispose?.(vi.fn(), signal)
    expect(tracker.onInvalidate).not.toHaveBeenCalled()
    expect(adapter.isInScope?.()).toBe(false)
  })
})
