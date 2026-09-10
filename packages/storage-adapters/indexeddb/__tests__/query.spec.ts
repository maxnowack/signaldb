// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import prepareIndexedDB from '../src'

interface Item { id: string, kind: string, rank: number, flagged: boolean }

/**
 * Prepares an adapter over a seeded store, and hands back its `query` already
 * narrowed — the capability is optional on the interface, and a test that
 * asserted it away with `!` would pass just as happily if it disappeared.
 * @param indices - Fields to create indexes for.
 * @returns The adapter and its `query` capability.
 */
async function withAdapter(indices: string[] = []) {
  const collectionName = `coll-${Math.floor(Math.random() * 1e17).toString(16)}`
  const prepare = prepareIndexedDB({
    databaseName: `db-${Math.floor(Math.random() * 1e17).toString(16)}`,
    version: 1,
    schema: { [collectionName]: indices },
  })
  const adapter = prepare<Item, string>(collectionName)
  await adapter.setup()
  await adapter.insert([
    { id: '1', kind: 'a', rank: 1, flagged: true },
    { id: '2', kind: 'b', rank: 2, flagged: false },
    { id: '3', kind: 'a', rank: 3, flagged: true },
  ])
  const { query } = adapter
  if (!query) throw new Error('the IndexedDB adapter should implement query')
  return { adapter, query: query.bind(adapter) }
}

const ids = (items: Item[]) => items.map(item => item.id).toSorted()

describe('IndexedDB storage adapter — query', () => {
  it('narrows on an indexed field and leaves nothing behind', async () => {
    const { query } = await withAdapter(['kind'])

    const answer = await query({ selector: { kind: 'a' } })

    expect(ids(answer.items)).toEqual(['1', '3'])
    expect(answer.residualSelector).toEqual({})
  })

  it('narrows on the key path', async () => {
    const { query } = await withAdapter()

    const answer = await query({ selector: { id: '2' } })

    expect(ids(answer.items)).toEqual(['2'])
  })

  it('applies one equality and hands the rest back', async () => {
    const { query } = await withAdapter(['kind'])

    const answer = await query({ selector: { kind: 'a', rank: 3 } })

    expect(ids(answer.items)).toEqual(['1', '3'])
    expect(answer.residualSelector).toEqual({ rank: 3 })
  })

  it('reads everything when no field is indexed, rather than guessing', async () => {
    const { query } = await withAdapter()

    const answer = await query({ selector: { kind: 'a' } })

    expect(ids(answer.items)).toEqual(['1', '2', '3'])
    expect(answer.residualSelector).toEqual({ kind: 'a' })
  })

  it('declines a value IndexedDB cannot use as a key', async () => {
    // null, undefined and booleans are not keys — asking for one throws rather
    // than answering nothing, which is why they are never pushed.
    const { query } = await withAdapter(['kind', 'flagged'])

    const answer = await query({ selector: { flagged: true } })

    expect(ids(answer.items)).toEqual(['1', '2', '3'])
    expect(answer.residualSelector).toEqual({ flagged: true })
  })

  it('claims neither an order nor a window nor a projection', async () => {
    // An index read comes back in index-key order and `readAll` in primary-key
    // order; neither is what `sortItems` produces, so claiming either would
    // make the caller trust an order nothing established.
    const { query } = await withAdapter(['kind'])

    const answer = await query({ selector: { kind: 'a' }, sort: { rank: 1 }, limit: 1 })

    expect(answer.sorted).toBeFalsy()
    expect(answer.windowed).toBeFalsy()
    expect(answer.projected).toBeFalsy()
    expect(answer.items).toHaveLength(2)
  })
})
