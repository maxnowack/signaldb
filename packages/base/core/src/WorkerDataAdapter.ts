import type { BaseItem } from './Collection'
import type Collection from './Collection'
import type DataAdapter from './DataAdapter'
import type { CollectionBackend, QueryOptions } from './DataAdapter'
import type Selector from './types/Selector'
import queryId from './utils/queryId'
import randomId from './utils/randomId'

interface WorkerDataAdapterOptions {
  id?: string,
}

export default class WorkerDataAdapter implements DataAdapter {
  private id: string
  private isDisposed = false
  private workerReady: Promise<void>
  private collectionReady: Map<string, Promise<void>> = new Map()
  private queries: Record<string, Map<string, {
    listeners: number,
    state: 'active' | 'complete' | 'error',
    error: Error | null,
    items: BaseItem[],
  }>> = {}

  constructor(private worker: Worker, private options: WorkerDataAdapterOptions) {
    this.id = this.options.id || 'default-worker-data-adapter'
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

  private queryListeners(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
  ): number

  private queryListeners(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
    listeners: number,
  ): void

  private queryListeners(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
    listeners?: number,
  ) {
    if (listeners != null) {
      return this.updateQuery(collectionName, query, { listeners })
    }

    const id = queryId(query.selector, query.options)
    const collectionQueries = this.queries[collectionName]
    if (!collectionQueries) return 0
    const existing = collectionQueries.get(id)
    return existing?.listeners || 0
  }

  private updateQuery(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
    update: { listeners?: number, state?: 'active' | 'complete' | 'error', error?: Error | null, items?: BaseItem[] },
  ) {
    const id = queryId(query.selector, query.options)
    const collectionQueries = this.queries[collectionName]
    if (!collectionQueries) return
    const existing = collectionQueries.get(id)
    collectionQueries.set(id, {
      listeners: 0,
      state: 'active',
      error: null,
      items: [],
      ...existing,
      ...update,
    })
    this.queries[collectionName] = collectionQueries
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    indices: string[] = [],
  ): CollectionBackend<T, I> {
    this.queries[collection.name] = new Map()
    void this.exec('registerCollection', collection.name, indices)
    this.collectionReady.set(collection.name, this.exec('isReady', collection.name))
    return {
      insert: async (item) => {
        return this.exec('insert', collection.name, item)
      },
      updateOne: async (selector, modifier) => {
        return this.exec('updateOne', collection.name, selector, modifier)
      },
      updateMany: async (selector, modifier) => {
        return this.exec('updateMany', collection.name, selector, modifier)
      },
      replaceOne: async (selector, replacement) => {
        return this.exec('replaceOne', collection.name, selector, replacement)
      },
      removeOne: async (selector) => {
        return this.exec('removeOne', collection.name, selector)
      },
      removeMany: async (selector) => {
        return this.exec('removeMany', collection.name, selector)
      },

      // methods for registering and unregistering queries that will be called from the collection during find/findOne
      registerQuery: (selector, options) => {
        const listeners = this.queryListeners(collection.name, { selector, options })
        if (listeners === 0) {
          this.updateQuery(collection.name, { selector, options }, { state: 'active', error: null, items: [] })
          void this.exec('registerQuery', collection.name, selector, options)
        }
        this.queryListeners(collection.name, { selector, options }, listeners + 1)
      },
      unregisterQuery: (selector, options) => {
        setTimeout(() => { // delay to allow multiple quick calls to register/unregister to batch
          const listeners = this.queryListeners(collection.name, { selector, options })
          const newListeners = Math.max(0, listeners - 1)
          if (newListeners === 0) {
            this.queries[collection.name]?.delete(queryId(selector, options))
            void this.exec('unregisterQuery', collection.name, selector, options)
          }
        }, 0)
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
          if (JSON.stringify(responseSelector) !== JSON.stringify(selector)) return
          if (JSON.stringify(responseOptions) !== JSON.stringify(options)) return
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
