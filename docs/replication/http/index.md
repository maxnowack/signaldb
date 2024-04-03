---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/http/
---
# Replicating Data with External HTTP REST API in SignalDB

If you've familiarized yourself with the [Replication Overview](/replication/), you're likely already acquainted with the process of achieving replication using an external HTTP REST API.

This page is dedicated to guiding you through the utilization of your existing HTTP REST API for data replication with SignalDB.

## Setup

To initiate data replication with an external HTTP REST API, you'll first need to create your Collection utilizing the specialized `ReplicatedCollection` class. In the following example, we'll illustrate this process using a straightforward todo list collection.

```js
const Todos = new ReplicatedCollection({
  pull: async () => {
    // We're fetching the todos from the API in the pull method
    // and returning the items to be added to the collection
    const items = await fetch('https://api.example.com/todos').then(res => res.json())
    return { items }
  },
  push: async (changes) => {
    // In the push method, we're sending the changes to the API
    // We have to differentiate between added, modified, and removed items
    await Promise.all([
      // For added items, we're sending a POST request with the item data in the body
      ...changes.added.map(async (item) => {
        await fetch('https://api.example.com/todos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: item.id,
            text: item.text,
            completed: item.completed,
          }),
        })
      }),

      // For modified items, we're sending a PATCH request with the item data in the body
      // You maybe have to change it to PUT or something else depending on your API
      ...changes.modified.map(async (item) => {
        await fetch(`https://api.example.com/todos/${item.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: item.text,
            completed: item.completed,
          }),
        })
      }),

      // For removed items, we're sending a DELETE request
      ...changes.removed.map(async (item) => {
        await fetch(`https://api.example.com/todos/${item.id}`, {
          method: 'DELETE',
        })
      }),
    ])
  },
})
```
That's it! You've successfully set up a collection that replicates data with an external HTTP REST API.

## Next Steps

Make sure you take a look at our [HTTP Replication Example](/examples/replication-http/) to see a full example of how you can replicate data with an external HTTP REST API.

If you have any questions or need help, feel free to ask a question on [Github](https://github.com/maxnowack/signaldb/discussions).
