import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { Collection } from '../src'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import type { WorkerDataAdapterHostEndpoint } from '../src/WorkerDataAdapterHost'
import type Selector from '../src/types/Selector'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

// The host answers a query through its own index providers, built on
// `readIndex` and `getMatchingKeys`. An unindexed `Collection` answers the same
// query by matching every item. They are two implementations of one semantics,
// and a disagreement between them surfaces only as a query returning the wrong
// documents — silently, with no error anywhere.
//
// Three defects were found by exactly this comparison: an `$or` unioned with
// the fields beside it instead of intersected, an `$in` on `id` falling through
// to a full read, and index keys compared raw on one side and serialized on the
// other.

type Document_ = { id: string, status?: string | null, tag?: string, prio?: number, flag?: boolean }

const seed: Document_[] = [
  { id: '1', status: 'open', tag: 'a', prio: 1, flag: true },
  { id: '2', status: 'open', tag: 'z', prio: 2, flag: false },
  { id: '3', status: 'closed', tag: 'a', prio: 1 },
  { id: '4', status: 'closed', tag: 'b', prio: 3, flag: true },
  { id: '5', status: 'open', tag: 'b', prio: 3, flag: false },
  { id: '6', status: null, tag: 'a', prio: 0 },
  { id: '7', prio: 2 },
  { id: '8', status: 'open', tag: 'a', prio: 10, flag: true },
]

const selectors: Record<string, Selector<Document_>> = {
  'equality': { status: 'open' },
  'null value': { status: null },
  'absent field': { status: { $exists: false } },
  'present field': { status: { $exists: true } },
  'numeric range': { prio: { $gt: 1 } },
  'numeric $in': { prio: { $in: [1, 3] } },
  'boolean equality': { flag: true },
  'boolean $ne': { flag: { $ne: true } },
  '$in': { tag: { $in: ['a', 'b'] } },
  '$nin': { tag: { $nin: ['a'] } },
  '$ne': { tag: { $ne: 'a' } },
  'two indexed fields': { status: 'open', tag: 'a' },
  'field and range': { status: 'open', prio: { $gt: 1 } },
  '$or': { $or: [{ status: 'open' }, { prio: 3 }] },
  '$or with null': { $or: [{ status: null }, { tag: 'b' }] },
  '$and': { $and: [{ status: 'open' }, { tag: { $in: ['a', 'b'] } }] },
  'field beside $or': { status: { $ne: 'open' }, $or: [{ tag: 'a' }, { tag: 'b' }] },
  'range beside $or': { prio: { $in: [1, 3] }, $or: [{ flag: true }, { status: 'closed' }] },
  '$nor': { $nor: [{ status: 'open' }] },
  'id $in': { id: { $in: ['1', '3'] } },
  'id $in beside a field': { id: { $in: ['1', '3'] }, status: 'open' },
  'id inside $or': { $or: [{ id: '1' }, { tag: 'b' }] },
  'indexed and absent': { status: 'open', tag: { $exists: false } },
  'two absent branches': { $or: [{ prio: { $gt: 5 } }, { flag: { $exists: false } }] },
}

describe('WorkerDataAdapterHost selector parity', () => {
  beforeAll(() => {
    globalThis.addEventListener = () => {}
    globalThis.postMessage = () => {}
  })

  afterAll(() => {
    globalThis.addEventListener = undefined as unknown as typeof globalThis.addEventListener
    globalThis.postMessage = undefined as unknown as typeof globalThis.postMessage
  })

  it.each(Object.entries(selectors))('answers %s like an unindexed collection', async (_name, selector) => {
    const responses: { id: string, data?: unknown }[] = []
    const context: WorkerDataAdapterHostEndpoint = {
      postMessage: vi.fn((payload: unknown) => {
        responses.push(payload as { id: string, data?: unknown })
      }),
      addEventListener: () => {},
    }
    const storage = memoryStorageAdapter<Document_>(seed.map(item => ({ ...item })))
    const host = new WorkerDataAdapterHost<Document_>(context, { id: 'parity', storage: () => storage })

    const send = async (method: string, args: unknown[]) => {
      const id = Math.random().toString(36).slice(2)
      await (host as unknown as {
        handleMessage: (host: string, id: string, method: string, args: unknown[]) => Promise<void>,
      }).handleMessage('parity', id, method, args)
      return responses.find(response => response.id === id)
    }
    await send('registerCollection', ['items', ['status', 'tag', 'prio', 'flag']])

    const reference = new Collection<Document_>()
    for (const item of seed) await reference.insert({ ...item })

    const response = await send('executeQuery', ['items', selector, undefined])
    const fromHost = ((response?.data as Document_[]) ?? []).map(item => item.id).toSorted()
    const fromReference = reference.find(selector).fetch().map(item => item.id).toSorted()

    expect(fromHost).toEqual(fromReference)
  })
})
