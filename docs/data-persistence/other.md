# Creating Custom Persistence Adapters

While SignalDB comes with a few built-in Persistence Adapters, there may be scenarios where you need to create a custom one to cater to specific requirements.

A custom Persistence Adapter is essentially a TypeScript class (or a constructor function in JavaScript) that implements certain methods corresponding to the fundamental data storage operations: save, load, delete. Here's an example:

```js
class MyPersistenceAdapter {
  async save(key, data) {
    // Implementation goes here
  }

  async load(key) {
    // Implementation goes here
  }

  async delete(key) {
    // Implementation goes here
  }
}
```

In these methods, `key` corresponds to the identifier for a document, and data is the document itself. Your implementation should determine how these values are stored in and retrieved from the storage medium.
