import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  name: string,
}

class MockWorkerContext {
  responses: any[] = []
  postMessage = vi.fn((payload: any) => {
    this.responses.push(payload)
  })
  private handler: ((event: MessageEvent) => void) | null = null

  addEventListener(type: 'message', listener: (event: MessageEvent) => any) {
    if (type !== 'message') return
    this.handler = listener
  }

  emit(data: any) {
    this.handler?.({ data } as MessageEvent)
  }
}

describe('WorkerDataAdapterHost', () => {
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
  let storageAdapters: Map<string, ReturnType<typeof memoryStorageAdapter<TestItem>>>

  beforeEach(() => {
    context = new MockWorkerContext()
    storageAdapters = new Map()
    host = new WorkerDataAdapterHost(context, {
      id: 'host',
      storage: (name) => {
        if (!storageAdapters.has(name)) {
          storageAdapters.set(name, memoryStorageAdapter<TestItem>([]))
        }
        return storageAdapters.get(name) as ReturnType<typeof memoryStorageAdapter<TestItem>>
      },
      log: vi.fn(),
    })
  })

  async function sendRequest(method: string, args: any[]) {
    const id = Math.random().toString(36).slice(2)
    await (host as any).handleMessage('host', id, method, args)
    return id
  }

  async function waitForResponse(id: string) {
    await vi.waitFor(
      () => context.postMessage.mock.calls.some(([payload]) => payload.id === id),
      { timeout: 5000 },
    )
    const call = context.postMessage.mock.calls.find(([payload]) => payload.id === id)
    const payload = call?.[0]
    if (!payload) throw new Error(`No response recorded for ${id}`)
    return payload
  }

  it('responds ready on construction', () => {
    expect(context.postMessage).toHaveBeenCalledWith({ id: 'ready', workerId: 'host', type: 'ready', data: null, error: null })
  })

  it('registers a collection and acknowledges isReady', async () => {
    context.postMessage.mockClear()
    const id = await sendRequest('registerCollection', ['items', ['name']])
    const registration = await waitForResponse(id)
    expect(registration).toBeDefined()
    expect(registration?.type).toBe('response')

    context.postMessage.mockClear()
    const readyId = await sendRequest('isReady', ['items'])
    const ready = await waitForResponse(readyId)
    expect(ready).toBeDefined()
    expect(ready?.type).toBe('response')
  })

  it('handles batched insert and returns stored items', async () => {
    context.postMessage.mockClear()
    const registerId = await sendRequest('registerCollection', ['items', []])
    await waitForResponse(registerId)
    context.postMessage.mockClear()
    const id = await sendRequest('insert', ['items', [[{ id: '1', name: 'Alpha' }], [{ id: '2', name: 'Beta' }]]])
    const response = await waitForResponse(id)
    expect(response).toBeDefined()
    expect(response?.type).toBe('response')
    expect(response?.data).toEqual([{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }])
  })

  it('executes queries via executeQuery', async () => {
    context.postMessage.mockClear()
    const registerId = await sendRequest('registerCollection', ['items', []])
    await waitForResponse(registerId)
    context.postMessage.mockClear()
    const insertId = await sendRequest('insert', ['items', [[{ id: '1', name: 'Alice' }]]])
    await waitForResponse(insertId)
    context.postMessage.mockClear()
    const queryId = await sendRequest('executeQuery', ['items', { name: 'Alice' }, undefined])
    const queryResponse = await waitForResponse(queryId)
    expect(queryResponse).toBeDefined()
    expect(queryResponse?.type).toBe('response')
    expect(queryResponse?.data).toEqual([{ id: '1', name: 'Alice' }])
  })

  it('returns error payloads when unknown method is invoked', async () => {
    const id = await sendRequest('unknownMethod' as any, [])
    expect(context.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id, error: expect.any(Error) }))
  })
})
