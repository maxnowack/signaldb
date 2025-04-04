import { it, expect } from 'vitest'
import { Collection } from '@signaldb/core'
import svelteReactivityAdapter from '../index.svelte.ts'

it('should be reactive with svelte', async () => {
  const collection = new Collection({
    reactivity: svelteReactivityAdapter,
  })

  const count = $derived(collection.find({}).count())

  expect(count).to.equal(0)
  collection.insert({ text: 'foo' })

  expect(count).to.equal(1)
})
