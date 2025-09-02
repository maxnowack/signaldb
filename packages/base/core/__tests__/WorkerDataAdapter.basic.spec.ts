import { describe, it, expect } from 'vitest'
import WorkerDataAdapter from '../src/WorkerDataAdapter'

// Mock Worker for basic functionality
class BasicMockWorker implements Worker {
  onmessage: ((this: Worker, event: MessageEvent) => any) | null = null
  onmessageerror: ((this: Worker, event: MessageEvent) => any) | null = null
  onerror: ((this: AbstractWorker, event: ErrorEvent) => any) | null = null
  terminate = () => {}
  postMessage = () => {}
  addEventListener = () => {}
  removeEventListener = () => {}
  dispatchEvent = () => false
}

describe('WorkerDataAdapter Basic Coverage', () => {
  it('should create adapter with id', () => {
    const worker = new BasicMockWorker()
    const adapter = new WorkerDataAdapter(worker, { id: 'test' })
    expect(adapter).toBeDefined()
  })

  it('should create adapter without id', () => {
    const worker = new BasicMockWorker()
    const adapter = new WorkerDataAdapter(worker, {})
    expect(adapter).toBeDefined()
  })

  it('should create collection backend', () => {
    const worker = new BasicMockWorker()
    const adapter = new WorkerDataAdapter(worker, { id: 'test' })

    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    expect(backend).toBeDefined()
    expect(backend.insert).toBeDefined()
    expect(backend.updateOne).toBeDefined()
    expect(backend.updateMany).toBeDefined()
    expect(backend.replaceOne).toBeDefined()
    expect(backend.removeOne).toBeDefined()
    expect(backend.removeMany).toBeDefined()
    expect(backend.registerQuery).toBeDefined()
    expect(backend.unregisterQuery).toBeDefined()
    expect(backend.getQueryState).toBeDefined()
    expect(backend.getQueryError).toBeDefined()
    expect(backend.getQueryResult).toBeDefined()
    expect(backend.onQueryStateChange).toBeDefined()
    expect(backend.dispose).toBeDefined()
    expect(backend.isReady).toBeDefined()
  })

  it('should handle query state operations', () => {
    const worker = new BasicMockWorker()
    const adapter = new WorkerDataAdapter(worker, { id: 'test' })
    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    const selector = { name: 'test' }
    const options = { limit: 10 }

    // These should not throw and return expected defaults
    backend.registerQuery(selector, options)
    expect(backend.getQueryState(selector, options)).toBe('active')
    expect(backend.getQueryError(selector, options)).toBeNull()
    expect(backend.getQueryResult(selector, options)).toEqual([])
    backend.unregisterQuery(selector, options)
  })

  it('should handle query state change listener', () => {
    const worker = new BasicMockWorker()
    const adapter = new WorkerDataAdapter(worker, { id: 'test' })
    const collection = { name: 'test' } as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const backend = adapter.createCollectionBackend(collection, [])

    const callback = () => {}
    const unsubscribe = backend.onQueryStateChange({ name: 'test' }, undefined, callback)

    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })
})
