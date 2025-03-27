import { it, expect } from 'vitest'
import { flushSync } from 'svelte'
import { Collection } from '@signaldb/core'
import svelteReactivityAdapter from '../index.svelte.ts'

it('should be reactive with svelte', async () => {
  const collection = new Collection({
    reactivity: svelteReactivityAdapter,
  })

  let count = $state(100)

  const cleanup = $effect.root(() => {
    $effect(() => {
      const cursor = collection.find({})
      count = cursor.count()

      return () => cursor.cleanup()
    })
  })

  flushSync()
  expect(count).to.equal(0)
  collection.insert({ text: 'foo' })

  flushSync()
  expect(count).to.equal(1)

  cleanup()
})
