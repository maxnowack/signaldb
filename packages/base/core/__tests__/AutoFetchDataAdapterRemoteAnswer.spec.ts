import { describe, it, expect, vi } from 'vitest'
import { Collection, AutoFetchDataAdapter } from '../src'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'
import createReactiveScope from './helpers/createReactiveScope'

type Post = { id: string, title?: string }

/**
 * Creates a promise together with the function that resolves it.
 * @template T - The type of the value the promise resolves to.
 * @returns The promise and its resolve function.
 */
function deferred<T>() {
  let resolve: (value: T) => void = () => { /* replaced below */ }
  const promise = new Promise<T>((resolve_) => {
    resolve = resolve_
  })
  return { promise, resolve }
}

const scope = createReactiveScope()

describe('AutoFetchDataAdapter answers a query from the remote source', () => {
  it('resolves an async query only after the first remote fetch for its selector', async () => {
    const remote = deferred<Post[]>()
    const storage = memoryStorageAdapter<Post>([{ id: 'cached', title: 'stale' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: () => remote.promise,
    })
    const posts = new Collection<Post>('posts', adapter)
    await posts.ready()

    let result: Post[] | undefined
    void posts.find({}, { async: true }).fetch().then((items) => {
      result = items
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(result).toBeUndefined()

    remote.resolve([{ id: 'remote', title: 'fresh' }])
    await vi.waitFor(() => expect(result).toBeDefined())
    expect(result).toEqual([
      { id: 'cached', title: 'stale' },
      { id: 'remote', title: 'fresh' },
    ])
  })

  it('keeps a live query loading and neutral until the first remote fetch settles', async () => {
    const remote = deferred<Post[]>()
    const storage = memoryStorageAdapter<Post>([{ id: 'cached', title: 'stale' }])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      fetchQueryItems: () => remote.promise,
    })
    const posts = new Collection<Post>('posts', adapter, { reactivity: scope.reactivity })
    await posts.ready()

    const cursor = posts.find({})
    const stop = cursor.observeChanges({ added: () => {} })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(scope.read(() => cursor.isLoading())).toBe(true)
    expect(scope.read(() => cursor.fetch())).toEqual([])

    remote.resolve([{ id: 'remote', title: 'fresh' }])
    await vi.waitFor(() => expect(scope.read(() => cursor.isLoading())).toBe(false))
    expect(scope.read(() => cursor.fetch())).toEqual([
      { id: 'cached', title: 'stale' },
      { id: 'remote', title: 'fresh' },
    ])
    stop()
  })

  it('settles a query as failed when its first remote fetch fails', async () => {
    const onError = vi.fn()
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([{ id: 'cached' }]),
      fetchQueryItems: () => Promise.reject(new Error('offline')),
      onError,
    })
    const posts = new Collection<Post>('posts', adapter, { reactivity: scope.reactivity })
    await posts.ready()
    const queryError = vi.fn()
    posts.on('query.error', queryError)

    const cursor = posts.find({})
    const stop = cursor.observeChanges({ added: () => {} })
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    await vi.waitFor(() => expect(scope.read(() => cursor.isLoading())).toBe(false))
    expect(scope.read(() => cursor.fetch())).toEqual([])
    stop()
  })

  it('purges items fetched again after a remote change once the query is gone', async () => {
    let remoteChange: (() => Promise<void>) | undefined
    const storage = memoryStorageAdapter<Post>([])
    const adapter = new AutoFetchDataAdapter({
      storage: () => storage,
      purgeDelay: 0,
      fetchQueryItems: async () => [{ id: '1', title: 'A' }],
      registerRemoteChange: async (callback) => {
        remoteChange = callback
      },
    })
    const posts = new Collection<Post>('posts', adapter, { reactivity: scope.reactivity })
    await posts.ready()

    const cursor = posts.find({})
    const stop = cursor.observeChanges({ added: () => {} })
    await vi.waitFor(() => expect(scope.read(() => cursor.isLoading())).toBe(false))
    await remoteChange?.()
    await remoteChange?.()
    expect(await storage.readAll()).toEqual([{ id: '1', title: 'A' }])

    stop()
    cursor.cleanup()
    await vi.waitFor(async () => expect(await storage.readAll()).toEqual([]))
  })

  it('works without a storage adapter by caching in memory', async () => {
    const adapter = new AutoFetchDataAdapter({
      fetchQueryItems: async () => [{ id: '1', title: 'A' }],
    })
    const posts = new Collection<Post>('posts', adapter, { indices: ['title'] })
    await posts.ready()

    await expect(posts.find({}, { async: true }).fetch()).resolves.toEqual([{ id: '1', title: 'A' }])
    await posts.insert({ id: '2', title: 'B' })
    await expect(posts.find({ title: 'B' }, { async: true }).fetch())
      .resolves.toEqual([{ id: '2', title: 'B' }])
  })

  it('names the expected shape when fetchQueryItems resolves to something else', async () => {
    const onError = vi.fn()
    const adapter = new AutoFetchDataAdapter({
      storage: () => memoryStorageAdapter<Post>([]),
      fetchQueryItems: () => Promise.resolve(undefined),
      onError,
    })
    const posts = new Collection<Post>('posts', adapter)
    await posts.ready()

    await posts.find({}, { async: true }).fetch().catch(() => { /* reported through onError */ })
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onError.mock.calls[0][0].message)
      .toBe('AutoFetchDataAdapter: fetchQueryItems must resolve to an array of items')
  })
})
