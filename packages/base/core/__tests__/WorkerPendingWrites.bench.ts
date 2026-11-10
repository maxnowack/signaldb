import { test, vi } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'
import type { WorkerDataAdapterEndpoint } from '../src/WorkerDataAdapter'
import type Collection from '../src/Collection'
import type Selector from '../src/types/Selector'

interface BenchItem {
  id: string,
  status: string,
  rank: number,
}

class SilentWorker implements WorkerDataAdapterEndpoint {
  private handlers: ((event: MessageEvent) => void)[] = []

  postMessage = vi.fn((message: unknown) => {
    const payload = message as { id: string, workerId: string, method: string }
    if (['registerCollection', 'isReady', 'registerQuery', 'unregisterQuery'].includes(payload.method)) {
      queueMicrotask(() => {
        this.emit({
          type: 'response', workerId: payload.workerId, id: payload.id, data: undefined, error: null,
        })
      })
    }
  })

  addEventListener = vi.fn((type: 'message', listener: (event: MessageEvent) => void) => {
    if (type !== 'message') return
    this.handlers.push(listener)
  })

  removeEventListener = vi.fn()

  emit(data: Record<string, unknown>) {
    const event = new MessageEvent('message', { data })
    for (const handler of this.handlers) handler(event)
  }
}

const selector: Selector<BenchItem> = { status: 'open' }

/**
 * An adapter with one registered query matching everything the burst below writes — the shape that
 * decides the cost, since a write only pays for the queries it actually touches.
 * @returns The collection backend to write through.
 */
async function withMatchingQuery() {
  const worker = new SilentWorker()
  const adapter = new WorkerDataAdapter(worker, { id: 'bench' })
  worker.emit({ type: 'ready', workerId: 'bench' })
  const backend = adapter.createCollectionBackend(
    { name: 'bench' } as unknown as Collection<BenchItem>,
    [],
  )
  await backend.isReady()
  backend.registerQuery(selector, {})
  worker.emit({
    type: 'queryUpdate',
    workerId: 'bench',
    data: {
      collectionName: 'bench', selector, options: {}, state: 'complete', items: [],
    },
    error: null,
  })
  return backend
}

// What a bulk import or a rebuild of a derived index does to this adapter: a long run of writes
// issued without awaiting any of them, so every one of them is still pending when the next arrives.
// Each write has to bring the matching query's served result up to date, and doing that by
// rebuilding it from the whole pending set is what made a burst quadratic in its own length.
test('a burst of writes with none of them settled', async ({ bench }) => {
  await bench.compare(
    bench('1000 unsettled inserts against one matching query', async () => {
      const backend = await withMatchingQuery()
      for (let index = 0; index < 1000; index += 1) {
        void backend.insert({ id: `item-${index}`, status: 'open', rank: index })
      }
    }),
    bench('4000 unsettled inserts against one matching query', async () => {
      const backend = await withMatchingQuery()
      for (let index = 0; index < 4000; index += 1) {
        void backend.insert({ id: `item-${index}`, status: 'open', rank: index })
      }
    }),
    // One iteration takes long enough that the default sample count would run for minutes.
    { iterations: 10, time: 500 },
  )
})

/**
 * An adapter whose one registered query already holds a result of the given size — what a
 * selector-based write is resolved against locally.
 * @param size - How many items the query holds.
 * @returns The collection backend to write through.
 */
async function withObservedItems(size: number) {
  const worker = new SilentWorker()
  const adapter = new WorkerDataAdapter(worker, { id: 'bench' })
  worker.emit({ type: 'ready', workerId: 'bench' })
  const backend = adapter.createCollectionBackend(
    { name: 'bench' } as unknown as Collection<BenchItem>,
    [],
  )
  await backend.isReady()
  backend.registerQuery(selector, {})
  const items = Array.from({ length: size }, (_, index) => ({ id: `item-${index}`, status: 'open', rank: index }))
  worker.emit({
    type: 'queryUpdate',
    workerId: 'bench',
    data: {
      collectionName: 'bench', selector, options: {}, state: 'complete', items,
    },
    error: null,
  })
  return backend
}

// A write by primary key with a guard beside the id — move a pointer forward, only if it is still
// behind — issued once per touched row. Each one has only one row it could possibly write, and
// resolving it by testing every observed item against a freshly compiled selector made it cost the
// size of every active query's result instead.
test('guarded writes by id against a large observed result', async ({ bench }) => {
  await bench.compare(
    bench('100 guarded updateMany against 1000 observed items', async () => {
      const backend = await withObservedItems(1000)
      for (let index = 0; index < 100; index += 1) {
        void backend.updateMany({ id: `item-${index}`, rank: { $lt: 5000 } }, { $set: { rank: 5000 } })
      }
    }),
    bench('100 guarded updateMany against 4000 observed items', async () => {
      const backend = await withObservedItems(4000)
      for (let index = 0; index < 100; index += 1) {
        void backend.updateMany({ id: `item-${index}`, rank: { $lt: 5000 } }, { $set: { rank: 5000 } })
      }
    }),
    { iterations: 10, time: 500 },
  )
})
