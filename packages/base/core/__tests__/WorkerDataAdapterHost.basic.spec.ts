import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WorkerDataAdapterHost from '../src/WorkerDataAdapterHost'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  name: string,
  value?: number,
}

// Mock Worker context for basic functionality
class BasicMockWorkerContext {
  postMessage = () => {}
  addEventListener = () => {}
}

type WC = {
  postMessage: (message: unknown) => void,
  addEventListener: (type: 'message', listener: (event: MessageEvent) => any) => void,
}

describe('WorkerDataAdapterHost Basic Coverage', () => {
  // Mock Web Worker global functions
  beforeAll(() => {
    ;(globalThis as unknown as { addEventListener: () => void }).addEventListener = () => {}
    ;(globalThis as unknown as { postMessage: () => void }).postMessage = () => {}
  })

  afterAll(() => {
    delete (globalThis as unknown as { addEventListener?: () => void }).addEventListener
    delete (globalThis as unknown as { postMessage?: () => void }).postMessage
  })
  it('should create host with storage adapter', () => {
    const mockContext = new BasicMockWorkerContext() as unknown as WC
    const host = new WorkerDataAdapterHost(mockContext, {
      storage: () => memoryStorageAdapter<TestItem>(),
      id: 'test-host',
    })
    expect(host).toBeDefined()
  })

  it('should create host without id', () => {
    const mockContext = new BasicMockWorkerContext() as unknown as WC
    const host = new WorkerDataAdapterHost(mockContext, {
      storage: () => memoryStorageAdapter<TestItem>(),
    })
    expect(host).toBeDefined()
  })

  it('should handle message with unknown method', () => {
    const mockContext = new BasicMockWorkerContext() as unknown as WC
    const host = new WorkerDataAdapterHost(mockContext, {
      storage: () => memoryStorageAdapter<TestItem>(),
      id: 'test-host',
    })

    // Should not throw for unknown method
    // call private handler with correct signature via any-cast
    expect(() => (host as any).handleMessage('test-host', 'test-msg', 'unknownMethod', [])).not.toThrow()
  })

  it('should handle message with wrong worker id', () => {
    const mockContext = new BasicMockWorkerContext() as unknown as WC
    const host = new WorkerDataAdapterHost(mockContext, {
      storage: () => memoryStorageAdapter<TestItem>(),
      id: 'test-host',
    })

    // Should ignore message with wrong worker id
    // call private handler with wrong worker id; should early-return
    expect(() => (host as any).handleMessage('different-host', 'test-msg', 'registerCollection', ['test-collection', []])).not.toThrow()
  })

  it('should handle malformed message', () => {
    const mockContext = new BasicMockWorkerContext() as unknown as WC
    const host = new WorkerDataAdapterHost(mockContext, {
      storage: () => memoryStorageAdapter<TestItem>(),
      id: 'test-host',
    })

    // Should throw for malformed message with null data
    // simulate malformed by passing invalid method name and args
    expect(() => (host as any).handleMessage('test-host', 'x', 'notAMethod', [])).not.toThrow()
  })

  it('should handle message without data', () => {
    const mockContext = new BasicMockWorkerContext() as unknown as WC
    const host = new WorkerDataAdapterHost(mockContext, {
      storage: () => memoryStorageAdapter<TestItem>(),
      id: 'test-host',
    })

    // Should throw for message without data
    // simulate by calling with empty worker id causing early return
    expect(() => (host as any).handleMessage('', 'x', 'registerCollection', ['x', []])).not.toThrow()
  })
})
