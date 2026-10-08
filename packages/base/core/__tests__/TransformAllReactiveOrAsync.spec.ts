import { describe, it, expect } from 'vitest'
import { AsyncDataAdapter, Collection, reactiveOrAsync, unwrap } from '../src'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'
import createReactiveScope from './helpers/createReactiveScope'
import { primitiveReactivity, primitiveReactivityAdapter } from './helpers/primitiveReactivity'

interface User {
  id: string,
  name: string,
}

interface Post {
  id: string,
  authorId: string,
  author?: User,
}

const scope = createReactiveScope()

/**
 * Builds a post collection whose transformAll resolves each post's author from `users`, written
 * once with reactiveOrAsync for both ways a query can be read.
 * @param users - The collection the authors are read from.
 * @param reactivity - The reactivity adapter of the post collection.
 * @returns The post collection.
 */
function createPosts(
  users: Collection<User>,
  reactivity = scope.reactivity,
) {
  return new Collection<Post>({
    reactivity,
    transformAll: reactiveOrAsync(function* (async: boolean, items: Post[]) {
      const ids = [...new Set(items.map(item => item.authorId))]
      const authors = yield* unwrap(users.find({ id: { $in: ids } }, { async }).fetch())
      return items.map(item => ({
        ...item,
        author: authors.find(author => author.id === item.authorId),
      }))
    }),
  })
}

describe('transformAll built with reactiveOrAsync', () => {
  it('awaits the related data on an asynchronous read', async () => {
    const users = new Collection<User>('users', new AsyncDataAdapter({
      storage: () => memoryStorageAdapter<User>([{ id: 'u1', name: 'Ada' }]),
    }))
    await users.ready()
    const posts = createPosts(users)
    await posts.insert({ id: 'p1', authorId: 'u1' })

    await expect(posts.find({}, { async: true }).fetch()).resolves.toEqual([
      { id: 'p1', authorId: 'u1', author: { id: 'u1', name: 'Ada' } },
    ])
    await expect(posts.findOne({ id: 'p1' }, { async: true })).resolves.toEqual(
      { id: 'p1', authorId: 'u1', author: { id: 'u1', name: 'Ada' } },
    )
  })

  it('reads the related data synchronously inside a reactive scope', async () => {
    const users = new Collection<User>({ reactivity: scope.reactivity })
    await users.insert({ id: 'u1', name: 'Ada' })
    const posts = createPosts(users)
    await posts.insert({ id: 'p1', authorId: 'u1' })

    expect(scope.read(() => posts.find({}).fetch())).toEqual([
      { id: 'p1', authorId: 'u1', author: { id: 'u1', name: 'Ada' } },
    ])
  })

  it('reruns a reactive read when the related data changes', async () => {
    const users = new Collection<User>({ reactivity: primitiveReactivityAdapter })
    await users.insert({ id: 'u1', name: 'Ada' })
    const posts = createPosts(users, primitiveReactivityAdapter)
    await posts.insert({ id: 'p1', authorId: 'u1' })

    const names: (string | undefined)[] = []
    primitiveReactivity.effect(() => {
      names.push(posts.find({}).fetch()[0]?.author?.name)
    })
    await users.updateOne({ id: 'u1' }, { $set: { name: 'Ada Lovelace' } })

    await expect.poll(() => names.at(-1)).toBe('Ada Lovelace')
  })

  it('keeps a plain transformAll working on an asynchronous read', async () => {
    const posts = new Collection<Post>({
      transformAll: items => items.map(item => ({
        ...item,
        authorId: item.authorId.toUpperCase(),
      })),
    })
    await posts.insert({ id: 'p1', authorId: 'u1' })

    await expect(posts.find({}, { async: true }).fetch()).resolves.toEqual([
      { id: 'p1', authorId: 'U1' },
    ])
  })

  it('refuses a promise on a synchronous read', async () => {
    const answerLater = (items: Post[]) => Promise.resolve(items)
    const posts = new Collection<Post>({
      reactivity: scope.reactivity,
      transformAll: answerLater as unknown as (items: Post[]) => Post[],
    })
    await posts.insert({ id: 'p1', authorId: 'u1' })

    expect(() => scope.read(() => posts.find({}).fetch())).toThrow(
      'transformAll returned a promise for a synchronous read',
    )
  })
})
