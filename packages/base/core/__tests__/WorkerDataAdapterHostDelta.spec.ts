import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import type { QueryOptions } from '../src/DataAdapter'
import type { QueryDelta } from '../src/utils/queryDelta'
import queryId from '../src/utils/queryId'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  status?: string,
  rank?: number,
  name?: string,
}

type WorkerHostMessage = {
  id: string,
  workerId: string,
  type: string,
  data: any,
  error: unknown,
}

class MockWorkerContext {
  responses: WorkerHostMessage[] = []
  postMessage = vi.fn((payload: WorkerHostMessage) => {
    this.responses.push(payload)
  })

  private handler: ((event: MessageEvent) => void) | null = null

  addEventListener(type: 'message', listener: (event: MessageEvent) => any) {
    if (type !== 'message') return
    this.handler = listener
  }

  clearResponses() {
    this.responses = []
    this.postMessage.mockClear()
  }

  queryUpdates(qid?: string) {
    return this.responses.filter(response => response.type === 'queryUpdate'
      && (qid == null || response.data?.qid === qid))
  }
}

describe('WorkerDataAdapterHost query deltas', () => {
  beforeAll(() => {
    ;(globalThis as any).addEventListener = () => {}
    ;(globalThis as any).postMessage = () => {}
  })

  afterAll(() => {
    delete (globalThis as any).addEventListener
    delete (globalThis as any).postMessage
  })

  let context: MockWorkerContext
  let host: WorkerDataAdapterHost<TestItem>
  let storage: ReturnType<typeof memoryStorageAdapter<TestItem>>

  const send = async (method: string, args: unknown[]) => {
    const id = Math.random().toString(36).slice(2)
    await (host as any).handleMessage('test-host', id, method, args)
    return id
  }

  const seed: TestItem[] = [
    { id: 'a', status: 'open', rank: 3, name: 'Anna' },
    { id: 'b', status: 'done', rank: 1, name: 'Ben' },
    { id: 'c', status: 'open', rank: 2, name: 'Cleo' },
  ]

  beforeEach(async () => {
    context = new MockWorkerContext()
    storage = memoryStorageAdapter<TestItem>(seed.map(item => ({ ...item })))
    host = new WorkerDataAdapterHost(context, { id: 'test-host', storage: () => storage })
    await send('registerCollection', ['items', []])
  })

  const lastDelta = (qid: string): QueryDelta<TestItem> | undefined => {
    const updates = context.queryUpdates(qid)
    return updates.at(-1)?.data?.delta as QueryDelta<TestItem> | undefined
  }

  describe('initial registration', () => {
    it('sends the full result the first time a query is answered', async () => {
      const qid = queryId({ status: 'open' }, { sort: { rank: 1 } })
      context.clearResponses()
      await send('registerQuery', ['items', { status: 'open' }, { sort: { rank: 1 } }])

      const [update] = context.queryUpdates(qid)
      expect(update.data.items).toEqual([
        { id: 'c', status: 'open', rank: 2, name: 'Cleo' },
        { id: 'a', status: 'open', rank: 3, name: 'Anna' },
      ])
      expect(update.data.delta).toBeUndefined()
    })
  })

  describe('updates after the first result', () => {
    const selector = { status: 'open' }
    const options: QueryOptions<TestItem> = { sort: { rank: 1 } }
    const qid = queryId(selector, options)

    beforeEach(async () => {
      await send('registerQuery', ['items', selector, options])
      context.clearResponses()
    })

    it('sends a delta instead of the whole result', async () => {
      await send('insert', ['items', [[{ id: 'd', status: 'open', rank: 1, name: 'Dan' }]]])

      const update = context.queryUpdates(qid).at(-1)
      expect(update?.data.items).toBeUndefined()
      expect(update?.data.delta).toBeDefined()
    })

    it('describes an insert as a single addition at its sorted position', async () => {
      await send('insert', ['items', [[{ id: 'd', status: 'open', rank: 1, name: 'Dan' }]]])

      expect(lastDelta(qid)).toEqual({
        added: [{ index: 0, item: { id: 'd', status: 'open', rank: 1, name: 'Dan' } }],
        changed: [],
        removed: [],
        moved: [],
        resultCount: 3,
      })
    })

    it('describes an update as a single change', async () => {
      await send('updateOne', ['items', [[{ id: 'a' }, { $set: { name: 'Annabel' } }]]])

      expect(lastDelta(qid)).toEqual({
        added: [],
        changed: [{ id: 'a', status: 'open', rank: 3, name: 'Annabel' }],
        removed: [],
        moved: [],
        resultCount: 2,
      })
    })

    it('describes an item leaving the result as a removal by id', async () => {
      await send('updateOne', ['items', [[{ id: 'a' }, { $set: { status: 'done' } }]]])

      expect(lastDelta(qid)).toEqual({
        added: [],
        changed: [],
        removed: ['a'],
        moved: [],
        resultCount: 1,
      })
    })

    it('describes a removal by id', async () => {
      await send('removeOne', ['items', [[{ id: 'c' }]]])

      expect(lastDelta(qid)).toEqual({
        added: [],
        changed: [],
        removed: ['c'],
        moved: [],
        resultCount: 1,
      })
    })

    it('describes a reorder as a move', async () => {
      await send('updateOne', ['items', [[{ id: 'a' }, { $set: { rank: 0 } }]]])

      const delta = lastDelta(qid)
      expect(delta?.added).toEqual([])
      expect(delta?.removed).toEqual([])
      expect(delta?.changed).toEqual([{ id: 'a', status: 'open', rank: 0, name: 'Anna' }])
      expect(delta?.moved).toEqual([{ index: 0, id: 'a' }])
    })

    it('stays silent when a write does not change the result', async () => {
      await send('insert', ['items', [[{ id: 'e', status: 'done', rank: 9, name: 'Eve' }]]])

      expect(context.queryUpdates(qid).filter(update => update.data.state === 'complete'))
        .toHaveLength(0)
    })

    it('does not read the whole collection back for an unlimited query', async () => {
      const readAll = vi.spyOn(storage, 'readAll')
      await send('updateOne', ['items', [[{ id: 'a' }, { $set: { name: 'Annabel' } }]]])
      expect(readAll).not.toHaveBeenCalled()
    })

    it('keeps its own copy of the result in step with the deltas it sent', async () => {
      await send('insert', ['items', [[{ id: 'd', status: 'open', rank: 1, name: 'Dan' }]]])
      await send('updateOne', ['items', [[{ id: 'c' }, { $set: { rank: 9 } }]]])
      await send('removeOne', ['items', [[{ id: 'a' }]]])

      const executed = await (host as any).executeQuery('items', selector, options)
      expect((host as any).queries.get('items').get(qid).items).toEqual(executed)
    })
  })

  describe('queries the previous result cannot answer', () => {
    const selector = { status: 'open' }
    const options: QueryOptions<TestItem> = { sort: { rank: 1 }, limit: 2 }
    const qid = queryId(selector, options)

    beforeEach(async () => {
      await send('registerQuery', ['items', selector, options])
      context.clearResponses()
    })

    it('still sends a delta, computed from a full re-execution', async () => {
      await send('insert', ['items', [[{ id: 'd', status: 'open', rank: 1, name: 'Dan' }]]])

      expect(lastDelta(qid)).toEqual({
        added: [{ index: 0, item: { id: 'd', status: 'open', rank: 1, name: 'Dan' } }],
        changed: [],
        removed: ['a'],
        moved: [],
        resultCount: 2,
      })
    })

    it('inserts without reading the collection back', async () => {
      // This asserted the opposite until the duplicate check inside `insert`
      // stopped asking for the whole collection. It never observed the window
      // being re-read: the only `readAll` here came from that check, and the
      // delta below is produced without touching the store at all.
      const readAll = vi.spyOn(storage, 'readAll')
      const readIds = vi.spyOn(storage, 'readIds')

      await send('insert', ['items', [[{ id: 'd', status: 'open', rank: 1, name: 'Dan' }]]])

      expect(readAll).not.toHaveBeenCalled()
      expect(readIds).toHaveBeenCalledWith(['d'])
      expect(lastDelta(qid)?.resultCount).toBe(2)
    })
  })

  describe('a query registered a second time', () => {
    it('is answered with a full result again, not with a delta', async () => {
      const selector = { status: 'open' }
      const qid = queryId(selector, undefined)
      await send('registerQuery', ['items', selector, undefined])
      await send('insert', ['items', [[{ id: 'd', status: 'open', rank: 1, name: 'Dan' }]]])
      context.clearResponses()

      await send('registerQuery', ['items', selector, undefined])
      const update = context.queryUpdates(qid).at(-1)
      expect(update?.data.delta).toBeUndefined()
      expect(update?.data.items).toHaveLength(3)
    })
  })
})
