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
  private queries: Record<string, Map<string, {
    state: 'active' | 'complete' | 'error',
    error: Error | null,
    items: BaseItem[],
  }>> = {}

  constructor(private worker: Worker, private options: WorkerDataAdapterOptions) {
    this.id = this.options.id || 'default-worker-data-adapter'
  }

  private exec<T>(method: string, ...args: any[]): Promise<T> {
    if (this.isDisposed) {
      return Promise.reject(new Error('WorkerDataAdapter is disposed'))
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
          this.worker.removeEventListener('message', handleMessage)
        } else {
          resolve(data as T)
          this.worker.removeEventListener('message', handleMessage)
        }
      }
      this.worker.addEventListener('message', handleMessage)
      this.worker.postMessage({ id: messageId, workerId: this.id, method, args })
    })
  }

  private updateQuery(
    collectionName: string,
    query: { selector: Selector<any>, options?: QueryOptions<any> },
    update: { state?: 'active' | 'complete' | 'error', error?: Error | null, items?: BaseItem[] },
  ) {
    const id = queryId(query.selector, query.options)
    const collectionQueries = this.queries[collectionName]
    if (!collectionQueries) return
    const existing = collectionQueries.get(id)
    if (!existing) return
    collectionQueries.set(id, { ...existing, ...update })
  }

  public createCollectionBackend<T extends BaseItem<I>, I = any, U = T>(
    collection: Collection<T, I, U>,
    indices: string[] = [],
  ): CollectionBackend<T, I> {
    this.queries[collection.name] = new Map()
    void this.exec('registerCollection', collection.name, indices)
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
          const { type, data, workerId, collectionName, error } = event.data
          if (type !== 'queryUpdate') return
          if (data == null) return
          const {
            selector: responseSelector,
            options: responseOptions,
            state,
            items,
          } = data as {
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
