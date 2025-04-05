import { it, describe, expect, vi } from 'vitest'
import { Collection } from '@signaldb/core'
import { tick } from 'svelte'
import svelteReactivityAdapter, { SvelteDependency } from '../index.svelte.ts'

describe('SvelteDependency', () => {
  it('should re-run effect', async () => {
    let cnt = 0
    let notify: (() => void) | undefined

    // eslint-disable-next-line prefer-const
    let count = $derived.by(() => {
      const dep = new SvelteDependency()
      notify = () => dep.notify()
      dep.depend()
      return cnt++
    })

    expect(count).to.equal(0)

    notify?.()
    expect(count).to.equal(1)
  })

  it('should call disposals', async () => {
    const callback = vi.fn()

    let notify: (() => void) | undefined
    // eslint-disable-next-line prefer-const
    let x = $derived.by(() => {
      const dep = new SvelteDependency()
      dep.onDispose(callback)
      notify = () => dep.notify()
      dep.depend()
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    x // to refresh $derived
    notify?.()
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    x
    await tick()
    expect(callback).toHaveBeenCalledTimes(1)
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    x
    await tick()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})

it('should be reactive with svelte', async () => {
  const collection = new Collection({
    reactivity: svelteReactivityAdapter,
  })

  const count = $derived(collection.find({}).count())

  expect(count).to.equal(0)
  collection.insert({ text: 'foo' })

  expect(count).to.equal(1)
})
