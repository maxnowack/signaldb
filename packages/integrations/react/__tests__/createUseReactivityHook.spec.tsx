/* @vitest-environment happy-dom */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { type FC } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { createUseReactivityHook } from '../src/index'

describe('createUseReactivityHook', () => {
  afterEach(() => {
    cleanup()
  })

  it('updates when the reactive computation notifies and disposes on unmount', () => {
    let source = 0
    let rerun: (() => void) | undefined
    const stopComputation = vi.fn()
    const effect = (fn: () => void) => {
      rerun = () => fn()
      fn()
      return () => {
        rerun = undefined
        stopComputation()
      }
    }
    const useReactive = createUseReactivityHook(effect)

    const Component: FC = () => {
      const value = useReactive(() => source, [])
      return <div data-testid="value">{value}</div>
    }

    const { getByTestId, unmount } = render(<Component />)
    expect(getByTestId('value').textContent).toBe('0')

    act(() => {
      source = 42
      rerun?.()
    })
    expect(getByTestId('value').textContent).toBe('42')

    unmount()
    expect(stopComputation).toHaveBeenCalled()
  })
})
