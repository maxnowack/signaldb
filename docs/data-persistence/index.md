# Data Persistence Adapters

Persistence Adapters in SignalDB provide the mechanism for storing and retrieving data, ensuring that your data is kept safe across sessions and reloads of your application. These adapters interact with the underlying storage medium, such as localStorage, IndexedDB, or even a remote server, handling the specifics of these storage systems while providing a uniform interface for data operations in your application.

Persistence Adapters are responsible for transforming the high-level operations you perform on your data (like saving a document or loading a collection) into the low-level operations that the specific storage system can understand and execute.

The principal advantage of using Persistence Adapters is the abstraction they offer. They allow SignalDB to remain agnostic about the underlying storage system. This means you can switch between different systems without modifying the rest of your code.
