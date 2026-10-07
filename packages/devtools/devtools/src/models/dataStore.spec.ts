import { describe, it, expect } from 'vitest'
import { waitFor } from '@testing-library/react'
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import dataStore from './dataStore'
import settingsStore from './settingsStore'

describe('dataStore', () => {
  it('tracks replaceOne as a mutation', async () => {
    settingsStore.patch({ trackMutations: true })
    const collection = new Collection<{ id: string, name: string }>(
      'replace-tracking',
      new DefaultDataAdapter(),
    )
    await collection.insert({ id: '1', name: 'one' })
    await collection.replaceOne({ id: '1' }, { name: 'uno' })

    await waitFor(() => {
      const tracked = dataStore.getItem('mutations')?.items
        .filter(mutation => mutation.collectionName === 'replace-tracking')
      expect(tracked?.map(mutation => mutation.type)).toEqual(['insert', 'replaceOne'])
      expect(tracked?.[1]).toMatchObject({ selector: { id: '1' }, modifier: { name: 'uno' } })
    })

    await collection.dispose()
  })
})
