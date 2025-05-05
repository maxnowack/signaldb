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

To add new methods to a specific collection instance, we have to create a new class that inherits from the collection class. With this approach, it's also possible to directly define collection options like the name or the persistence adapter.

In the example below, we create a new class `PostsCollection` that inherits from the `Collection` class and add a new method `findPublishedPosts` to the class. This method returns a `Cursor` to all published posts from the collection.

```js
import { Collection } from '@signaldb/core'

class PostsCollection extends Collection {
  constructor() {
    super({
      name: 'posts',
      reactivity: /* specify reactivity options */,
      persistence: /* specify persistence adapter */,
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
import { Collection } from '@signaldb/core'

class Post {
  constructor(data) {
    Object.assign(this, data)
  }

  hasComments() {
    return this.comments.length > 0
  }
}

const Posts = new Collection({ transform: item => new Post(item) })
```

In the example above, we create a new class `Post` that adds a new instance method `hasComments` to the class. This method returns `true` if the post has comments and `false` if not.

## Resolving Relationships

With the ORM functionality, you can also resolve relationships between items in different collections. You can even chain them together later on in your code to build complex queries that span multiple collections and also reactively rerun on changes.

```js
import { Collection } from '@signaldb/core'

class Post {
  constructor(data) {
    Object.assign(this, data)
  }

  getAuthor() {
    return Users.findOne(this.authorId)
  }

  getComments() {
    return Comments.find({ postId: this._id })
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
    return Posts.find({ authorId: this._id })
  }
}

const Posts = new Collection({ name: 'posts', transform: item => new Post(item) })
const Users = new Collection({ name: 'users', transform: item => new User(item) })
const Comments = new Collection({ name: 'comments', transform: item => new Comment(item) })

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
