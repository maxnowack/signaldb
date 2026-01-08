import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type Selector from './types/Selector'
import queryId from './utils/queryId'
import randomId from './utils/randomId'
import batchOnNextTick from './utils/batchOnNextTick'

interface WorkerDataAdapterOptions {
  id?: string,
  log?: (message: string, ...args: any[]) => void,
}

export default class WorkerDataAdapter implements DataAdapter {
  private id: string
  private isDisposed = false
  private workerReady: Promise<void>
  private log: (message: string, ...args: any[]) => void = () => {}
  private collectionReady: Map<string, Promise<void>> = new Map()
  private batchExecutionHelpers: Map<string, ReturnType<typeof batchOnNextTick<string>>> = new Map()
  private queries: Record<string, Map<string, {
    state: 'active' | 'complete' | 'error',
    error: Error | null,
    items: BaseItem[],
  }>> = {}

  constructor(private worker: Worker, private options: WorkerDataAdapterOptions) {
    this.id = this.options.id || 'default-worker-data-adapter'
    if (this.options.log) this.log = this.options.log
    this.workerReady = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('WorkerDataAdapter initialization timed out'))
      }, 5000)
      const handleMessage = (event: MessageEvent) => {
        const { type, workerId } = event.data as { type: 'ready', workerId: string }
        if (workerId !== this.id) return
        if (type === 'ready') {
          resolve()
          clearTimeout(timeoutId)
          this.worker.removeEventListener('message', handleMessage)
        }
      }
      this.worker.addEventListener('message', handleMessage)
    })
  }

  private async exec<T>(method: string, collectionName: string, ...args: any[]): Promise<T> {
    await this.workerReady
    if (method !== 'isReady') {
      const collectionReady = this.collectionReady.get(collectionName)
      if (!collectionReady) throw new Error(`Collection "${collectionName}" is not registered in WorkerDataAdapter`)
      await collectionReady
    }
    if (this.isDisposed) {
      throw new Error('WorkerDataAdapter is disposed')
    }
    return new Promise((resolve, reject) => {
      const messageId = randomId()
      const handleMessage = (event: MessageEvent) => {
        const { id, workerId, type, data, error } = event.data as {
          id: string,
          workerId: string,
          type: 'response' | 'queryUpdate',
          data?: T,
          error?: Error,
        }
        if (workerId !== this.id) return
        if (type !== 'response') return
        if (id !== messageId) return

        this.log(method, 'result', data ?? error)
        if (error) {
          reject(error)
        } else {
          resolve(data as T)
        }
        this.worker.removeEventListener('message', handleMessage)
      }
      this.worker.addEventListener('message', handleMessage)
      this.worker.postMessage({
        id: messageId,
        workerId: this.id,
        method,
        args: [collectionName, ...args],
      })
    })
  }

  private enqueueBatched<T>(collectionName: string, method: string, args: any[]): Promise<T> {
    const helper = this.batchExecutionHelpers.get(collectionName)
    if (!helper) throw new Error(`Collection "${collectionName}" is not registered in WorkerDataAdapter`)
    return helper.enqueue(method, args)
  }
  // ---------- end batching integration ----------

  private updateQuery(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
    update: { state?: 'active' | 'complete' | 'error', error?: Error | null, items?: BaseItem[] },
  ) {
    const id = queryId(query.selector, query.options)
    const collectionQueries = this.queries[collectionName]
    if (!collectionQueries) return
    const existing = collectionQueries.get(id)
    const newState = {
      state: 'active' as const,
      error: null,
      items: [],
      ...existing,
      ...update,
    }
    collectionQueries.set(id, newState)
    this.queries[collectionName] = collectionQueries
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, E extends BaseItem = T, U = E>(
    collection: Collection<T, I, E, U>,
    indices: string[] = [],
  ): CollectionBackend<T, I> {
    this.queries[collection.name] = new Map()
    void this.exec('registerCollection', collection.name, indices)
    this.collectionReady.set(collection.name, this.exec('isReady', collection.name))
    this.batchExecutionHelpers.set(
      collection.name,
      batchOnNextTick<string>(async (method, args) => this.exec(method, collection.name, args)),
    )
    return {
      insert: async (item) => {
        return this.enqueueBatched<T>(collection.name, 'insert', [item])
      },
      updateOne: async (selector, modifier) => {
        return this.enqueueBatched<T[]>(collection.name, 'updateOne', [selector, modifier])
      },
      updateMany: async (selector, modifier) => {
        return this.enqueueBatched<T[]>(collection.name, 'updateMany', [selector, modifier])
      },
      replaceOne: async (selector, replacement) => {
        return this.enqueueBatched<T[]>(collection.name, 'replaceOne', [selector, replacement])
      },
      removeOne: async (selector) => {
        return this.enqueueBatched<T[]>(collection.name, 'removeOne', [selector])
      },
      removeMany: async (selector) => {
        return this.enqueueBatched<T[]>(collection.name, 'removeMany', [selector])
      },

      // methods for registering and unregistering queries that will be called from the collection during find/findOne
      registerQuery: (selector, options) => {
        this.updateQuery(collection.name, { selector, options }, { state: 'active', error: null, items: [] })
        void this.exec('registerQuery', collection.name, selector, options)
      },
      unregisterQuery: (selector, options) => {
        this.queries[collection.name]?.delete(queryId(selector, options))
        void this.exec('unregisterQuery', collection.name, selector, options)
      },
      getQueryState: (selector, options) => {
        const query = this.queries[collection.name]?.get(queryId(selector, options))
        return query?.state || 'active'
      },
      getQueryError: (selector, options) => {
        const query = this.queries[collection.name]?.get(queryId(selector, options))
        return query?.error || null
      },
      getQueryResult: (selector, options) => {
        const query = this.queries[collection.name]?.get(queryId(selector, options))
        return query?.items as T[] || []
      },
      onQueryStateChange: (selector, options, callback) => {
        const handler = (event: MessageEvent) => {
          const { type, data, workerId, error } = event.data
          if (type !== 'queryUpdate') return
          if (data == null) return
          const {
            collectionName,
            selector: responseSelector,
            options: responseOptions,
            state,
            items,
          } = data as {
            collectionName: string,
            selector: Selector<T>,
            options?: QueryOptions<T>,
            state: 'active' | 'complete' | 'error',
            items: T[],
          }
          if (workerId !== this.id) return
          if (collectionName !== collection.name) return
          if (queryId(responseSelector, responseOptions) !== queryId(selector, options)) return
          this.log('queryUpdate', responseSelector, responseOptions, state, data ?? error)
          this.updateQuery(collection.name, {
            selector: responseSelector,
            options: responseOptions,
          }, { state, error, items })
          callback(state)
        }
        this.worker.addEventListener('message', handler)
        return () => {
          this.worker.removeEventListener('message', handler)
        }
      },
      executeQuery: (selector, options) => this.exec('executeQuery', collection.name, selector, options),

      // lifecycle methods
      dispose: async () => {
        await this.exec('unregisterCollection', collection.name)
        this.isDisposed = true
        this.worker.terminate()
      },
      isReady: async () => {
        await this.exec('isReady', collection.name)
      },
    }
  }
}
