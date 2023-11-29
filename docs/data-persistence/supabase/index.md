---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/supabase/
---
# Supabase Persistence Adapter

In the evolving world of web applications, the importance of data persistence and consistency cannot be overstated. While SignalDB excels as an efficient in-memory database, it faces the risk of data loss during events like page reloads. Addressing this challenge, the integration of persistence adapters, such as one for Supabase, becomes critical. Supabase, an open-source Firebase alternative, provides a suite of powerful features that can significantly augment SignalDB's functionality. Incorporating a Supabase persistence adapter ensures not only the persistence of data within SignalDB but also enables seamless interaction with Supabase’s real-time database and authentication services.

The role of persistence adapters within SignalDB is to facilitate a connection between SignalDB and various storage solutions, in this case, Supabase’s PostgreSQL database and storage services. These adapters convert the high-level data operations of applications into low-level operations that are compatible with Supabase's storage system. With a Supabase persistence adapter integrated, developers can leverage the platform's capabilities, including real-time data updates, secure user authentication, and efficient data storage, aligning them with SignalDB’s in-memory data handling. The aim is to utilize the persistence adapter for storing and managing data within the robust framework of Supabase.

One of the main advantages of using a Supabase persistence adapter is the substantial level of flexibility and abstraction it provides. It enables SignalDB to interact fluidly with Supabase's comprehensive backend services, ensuring uninterrupted data continuity even in scenarios involving application reloads or extended user sessions. Moreover, decoupling SignalDB from its storage medium through the adapter simplifies transitioning to different storage systems or updating backend services, requiring minimal code adjustments. In essence, a Supabase persistence adapter functions as a vital bridge, connecting SignalDB’s in-memory functionalities with Supabase’s persistent data storage and backend capabilities.

For a practical demonstration, our [Supabase Example](https://github.com/maxnowack/signaldb/tree/main/examples/supabase) showcases a basic yet functional implementation of a persistence adapter for Supabase. The helper function for crafting a Supabase persistence adapter for a SignalCollection is available here: [`createSupabasePersistenceAdapter`](https://github.com/maxnowack/signaldb/blob/main/examples/supabase/src/utils/createSupabasePersistenceAdapter.ts), with its usage illustrated [here](https://github.com/maxnowack/signaldb/blob/main/examples/supabase/src/system/setupCollection/persistence.ts).
