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

    // wrap in function to avoid svelte compiler warning: `state_referenced_locally`
    const getCount = () => count
    expect(getCount()).to.equal(0)

    notify?.()
    expect(getCount()).to.equal(1)
  })

  it('should call disposals', async () => {
    let cnt = 0
    let notify: (() => void) | undefined
    const callback = vi.fn()

    // eslint-disable-next-line prefer-const
    let count = $derived.by(() => {
      const dep = new SvelteDependency()
      dep.onDispose(callback)
      notify = () => dep.notify()
      dep.depend()

      return cnt++
    })

    const getCount = () => count
    expect(getCount()).to.equal(0)

    notify?.()
    expect(getCount()).to.equal(1)
    await tick()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})

it('should be reactive with svelte', async () => {
  const collection = new Collection({
    reactivity: svelteReactivityAdapter,
  })

  const count = $derived(collection.find({}).count())
  const getCount = () => count

  expect(getCount()).to.equal(0)
  await collection.insert({ text: 'foo' })

  expect(getCount()).to.equal(1)
})
