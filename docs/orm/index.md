---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/orm/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/orm/
- - meta
  - name: og:title
    content: Object-Relational Mapping (ORM) | SignalDB
- - meta
  - name: og:description
    content: Learn how to use SignalDB for ORM-like functionality with reactive relationships, instance methods, and TypeScript support.
- - meta
  - name: description
    content: Learn how to use SignalDB for ORM-like functionality with reactive relationships, instance methods, and TypeScript support.
- - meta
  - name: keywords
    content: SignalDB, ORM, reactive database, JavaScript ORM, TypeScript ORM, object relational mapping, reactive relationships, database methods, SignalDB tutorials, SignalDB features
---
# Object-Relational Mapping (ORM) with SignalDB

SignalDB provides functionality to add methods to [collections](/reference/core/collection/) and item instances to enable ORM-like behavior. With this functionality, you can also reactively resolve relationships between items in different collections.

## Adding Instance Methods to Collections

To add new methods to a specific collection instance, we have to create a new class that inherits from the collection class. With this approach, it's also possible to directly define collection options like the name or the data adapter.

In the example below, we create a new class `PostsCollection` that inherits from the `Collection` class and add a new method `findPublishedPosts` to the class. This method returns a `Cursor` to all published posts from the collection.

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'

const dataAdapter = new DefaultDataAdapter()

class PostsCollection extends Collection {
  constructor() {
    super('posts', dataAdapter, {
      reactivity: /* specify reactivity options */,
    })
  }

  // instance method to find all published posts
  findPublishedPosts() {
    return this.find({ published: true })
  }

}

const Posts = new PostsCollection()


const publishedPosts = Posts.findPublishedPosts().fetch()
```

You can use this pattern to add methods to your collection that predefines queries that you use often in your application like in the example above.
You can also override existing methods like `removeOne` or `updateOne` to add custom behavior or custom checks to your collection. If you want to check if a user has the permission to delete or update a post for example.

## Adding Instance Methods to Items

To add new instance methods to a specific item instance, we have to create a new class for item instances and transform items to an instance of this class using the [`transform` option](/reference/core/collection/#constructor) of the collection.

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'

class Post {
  constructor(data) {
    Object.assign(this, data)
  }

  hasComments() {
    return this.comments.length > 0
  }
}

const Posts = new Collection('posts', new DefaultDataAdapter(), {
  transform: item => new Post(item),
})
```

In the example above, we create a new class `Post` that adds a new instance method `hasComments` to the class. This method returns `true` if the post has comments and `false` if not.

## Resolving Relationships

With the ORM functionality, you can also resolve relationships between items in different collections. You can even chain them together later on in your code to build complex queries that span multiple collections and also reactively rerun on changes.

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'

class Post {
  constructor(data) {
    Object.assign(this, data)
  }

  getAuthor() {
    return Users.findOne(this.authorId)
  }

  getComments() {
    return Comments.find({ postId: this.id })
  }
}

class Comment {
  constructor(data) {
    Object.assign(this, data)
  }

  getAuthor() {
    return Users.findOne(this.authorId)
  }
}

class User {
  constructor(data) {
    Object.assign(this, data)
  }

  getPosts() {
    return Posts.find({ authorId: this.id })
  }
}

const dataAdapter = new DefaultDataAdapter()
const Posts = new Collection('posts', dataAdapter, { transform: item => new Post(item) })
const Users = new Collection('users', dataAdapter, { transform: item => new User(item) })
const Comments = new Collection('comments', dataAdapter, { transform: item => new Comment(item) })

effect(() => {
  const lastPost = Posts.findOne({}, {
    sort: { createdAt: -1 },
  })

  // get the author of the last comment of the last post
  const authorOfLastComment = lastPost.getComments().fetch()[0].getAuthor()

  // get comment count of all posts of the author
  let commentCount = 0
  authorOfLastComment.getPosts().forEach((post) => {
    commentCount += post.getComments().count()
  })
})
```

In the example above, we create three classes `Post`, `Comment`, and `User` that add new instance methods to the classes. These methods resolve relationships between items in different collections. With this functionality, you can move complex queries to the item classes and run them in a more declarative way in your application code.

## TypeScript Support

Adding instance methods to collection or item instances requires using a helper class to maintain type safety for the instance class. This is because we need to include all properties in the class interface.

```ts
declare interface BaseEntity<T extends {}> extends T {}
class BaseEntity<T extends {}> {
  constructor(data: T) {
    Object.assign(this, data)
  }
}
```

With this helper class, you only need to inherit from BaseEntity and provide the item type as a generic parameter to the class.

```ts
interface PostType {
  id: string,
  title: string,
  content: string,
  authorId: string,
  createdAt: number,
}

class Post extends BaseEntity<PostType> {
  getAuthor() {
    return Users.findOne(this.authorId)
  }
}
```


## Solving the N+1 Problem with transformAll

While the instance method approach (like `post.getAuthor()`) is convenient for accessing related data on individual items, it can lead to the "N+1 problem" when dealing with multiple items. If you fetch N posts and then call `getAuthor()` on each, you might end up making N additional database queries (1 query for the posts + N queries for the authors).

To address this, SignalDB offers an `transformAll` option in the `Collection` constructor. This allows you to define a function that efficiently pre-loads related data in bulk for a set of items *before* they are returned by a query, significantly reducing the number of database operations.

### How transformAll Works

The `transformAll` function you provide receives two arguments:
1.  `items`: An array of items that matched the query's filter, *after* sorting and limiting, but *before* being returned.
2.  `fields`: The `fields` projection object specified in the query options (e.g., `{ name: 1, author: 1 }`).

Inside this function, you can:
1.  **Check `fields`:** Determine if the related data field (e.g., `author`) was actually requested in the query. This prevents unnecessary fetching.
2.  **Collect Foreign Keys:** Extract the unique IDs (foreign keys) needed to fetch the related data from the `items` array.
3.  **Bulk Fetch:** Perform a *single* query on the related collection (e.g., `Users`) to retrieve all necessary related items at once using the collected keys (e.g., using `$in`).
4.  **Map Data:** Return a new list in which each item carries the fetched related object alongside (or instead of) its foreign key.

This process happens automatically whenever a query using the relevant `fields` is executed or re-runs due to reactivity.

### Example

Let's redefine our `Posts` and `Users` collections to use transformAll for fetching authors:

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import maverickjsReactivityAdapter from '@signaldb/maverickjs'

const dataAdapter = new DefaultDataAdapter()

// User Collection (No changes needed here for this example)
const Users = new Collection('users', dataAdapter, {
  reactivity: maverickjsReactivityAdapter,
})

// Populate Users
await Users.insert({ id: 'user1', name: 'Alice' })
await Users.insert({ id: 'user2', name: 'Bob' })


// Post Collection with transformAll
const Posts = new Collection('posts', dataAdapter, {
  reactivity: maverickjsReactivityAdapter,
  // --- transformAll Function ---
  transformAll: (items, fields) => {
    // 1. Check if the 'author' field is requested
    if (!fields?.author) return items

    // 2. Collect unique author IDs
    const authorIds = [...new Set(items.map(item => item.authorId))]
    // 3. Bulk fetch authors
    const relatedAuthors = Users.find({ id: { $in: authorIds } }).fetch()
    // 4. Map authors back to posts
    return items.map(item => ({
      ...item,
      author: relatedAuthors.find(author => author.id === item.authorId),
    }))
  },
})

// Populate Posts
await Posts.insert({ id: 'post1', title: 'First Post', authorId: 'user1' })
await Posts.insert({ id: 'post2', title: 'Second Post', authorId: 'user2' })
await Posts.insert({ id: 'post3', title: 'Third Post', authorId: 'user1' })

// --- Usage ---

// Query requesting the author field - transformAll runs
const postsWithAuthors = Posts.find({}, { fields: { title: 1, author: 1 } }).fetch()
console.log(postsWithAuthors)
/* Output:
[
  { id: 'post1', title: 'First Post', author: { id: 'user1', name: 'Alice' } },
  { id: 'post2', title: 'Second Post', author: { id: 'user2', name: 'Bob' } },
  { id: 'post3', title: 'Third Post', author: { id: 'user1', name: 'Alice' } }
]
*/

// Query NOT requesting the author field - transformAll is skipped for 'author'
const postsWithoutAuthors = Posts.find({}, { fields: { title: 1, authorId: 1 } }).fetch()
console.log(postsWithoutAuthors)
/* Output:
[
  { id: 'post1', title: 'First Post', authorId: 'user1' },
  { id: 'post2', title: 'Second Post', authorId: 'user2' },
  { id: 'post3', title: 'Third Post', authorId: 'user1' }
]
*/
```

`transformAll` **returns** the transformed list rather than modifying `items`
in place. Returning `items` unchanged, as the early return above does, is how
you say "nothing to do for this query".
### Reactivity

The transformAll process is fully integrated with SignalDB's reactivity system. If the data in the related collection changes (e.g., a user's name is updated), any reactive query that includes the transformAll field will automatically re-run and reflect the changes.

```js
import { effect, Users, Posts } from './your-setup'; // Assuming Users, Posts, effect are set up/imported

effect(() => {
  // This query requests the transformAll 'author' field
  const posts = Posts.find({ id: 'post1' }, { fields: { title: 1, author: 1 } }).fetch()
  console.log('Post 1 Author:', posts[0]?.author?.name)
})

// Initial output: Post 1 Author: Alice

// Now, update the related user
await Users.updateOne({ id: 'user1' }, { $set: { name: 'Alice Smith' } })

// The effect will re-run automatically due to the change in Users
// Updated output: Post 1 Author: Alice Smith
```
By using the transformAll option, you can efficiently load related data, avoid the N+1 problem, and maintain reactivity, especially when dealing with lists or collections of items. This approach is often more performant than using instance methods for simple relationship loading in bulk scenarios.