---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/schema-validation/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/schema-validation/
- - meta
  - name: og:title
    content: Schema Validation | SignalDB
- - meta
  - name: og:description
    content: Discover how SignalDB supports schema validation using custom validation events and Zod integration for robust, type-safe data.
- - meta
  - name: description
    content: Discover how SignalDB supports schema validation using custom validation events and Zod integration for robust, type-safe data.
- - meta
  - name: keywords
    content: SignalDB, schema validation, Zod, data integrity, validation, TypeScript, SignalDB tutorials, SignalDB features
---

# Schema Validation in SignalDB

Although SignalDB is schema-less by design, it provides a mechanism to validate items against a defined schema before they are saved to the database. This is achieved by emitting a [`validate`](/reference/core/collection/#events) event with the item as its argument. If no handler is registered for this event, the item is automatically considered valid and is saved. However, by registering your own handler for the [`validate`](/reference/core/collection/#events) event, you can enforce custom validation rules and prevent invalid items from being stored by throwing an error.

**Key Points:**
- **Validation Trigger:** Before an item is saved, the [`validate`](/reference/core/collection/#events) event is emitted.
- **Custom Validation:** You can register a handler to check the item against any schema or rule set.
- **Default Behavior:** Without a handler, all items are treated as valid.
- **Error Handling:** Throwing an error in your handler stops the item from being saved.

## Basic Usage

Below is an example of how to register a simple validation for a collection:

```js
import { Collection } from '@signaldb/core'

const Posts = new Collection()

// Register a validation handler that ensures each post has a 'title'
Posts.on('validate', (post) => {
  if (!post.title) {
    throw new Error('Title is required')
  }
})

// This insertion works because 'title' is provided
Posts.insert({ title: 'Hello, World!' })

// This insertion will throw an error due to the missing 'title'
Posts.insert({ author: 'Joe' })
```

## Advanced Example with Zod

For more robust validation, you can integrate a library like [Zod](https://zod.dev) to define and enforce schemas. A dedicated `SchemaCollection` class acts as a wrapper around SignalDB's `Collection`, automatically validating items against a provided Zod schema. This approach ensures both runtime validation and compile-time type safety by inferring types directly from the schema.

```ts
import { Collection } from '@signaldb/core'
import type { CollectionOptions } from '@signaldb/core'
import type { ZodSchema, infer as ZodInfer } from 'zod'

interface SchemaCollectionOptions<
  T extends ZodSchema<BaseItem<I>>,
  I,
  U = ZodInfer<T>,
> extends CollectionOptions<ZodInfer<T>, I, U> {
  schema: T,
}

class SchemaCollection<
  T extends ZodSchema<BaseItem<I>>,
  I = any,
  U = ZodInfer<T>,
> extends Collection<ZodInfer<T>, I, U> {
  private schema: T

  constructor(options: SchemaCollectionOptions<T, I, U>) {
    super(options)
    this.schema = options.schema

    // Automatically validate each item against the Zod schema before saving
    this.on('validate', (item) => {
      this.schema.parse(item)
    })
  }
}
```

You can now create a collection with schema validation using `SchemaCollection`:

```ts
import { z } from 'zod'

const Posts = new SchemaCollection({
  schema: z.object({
    title: z.string(),
    content: z.string(),
  }),
})

// This insertion is valid because it meets the schema requirements
Posts.insert({ title: 'Hello, World!', content: 'This is a post content.' })

// This insertion will throw an error because the 'content' field is missing
Posts.insert({ title: 'Hello, World!' })
```

## Additional Considerations

- **Error Management:** Ensure that your application catches and handles validation errors appropriately to provide meaningful feedback to the user.
- **Extensibility:** While the advanced example uses Zod, you can integrate other validation libraries in a similar manner by modifying the event handler.
- **Type-Safety:** Leveraging schema validation with a tool like Zod not only validates runtime data but also infers types, reducing redundancy in your type definitions.

By using SignalDB's built-in validation mechanism, you can maintain data integrity even in a flexible, schema-less environment, while still enjoying the benefits of custom validation rules and type safety.
