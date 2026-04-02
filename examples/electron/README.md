## Example how to use SignalDB with Electron

The interesting part is in these files:
* [src/main/index.ts](https://github.com/maxnowack/signaldb/blob/main/examples/electron/src/main/index.ts) — Main process: creates Collections with filesystem persistence and sets up the IPC bridge
* [src/preload/index.ts](https://github.com/maxnowack/signaldb/blob/main/examples/electron/src/preload/index.ts) — Preload script: exposes the SignalDB bridge to the renderer
* [src/renderer/models/Todos.ts](https://github.com/maxnowack/signaldb/blob/main/examples/electron/src/renderer/models/Todos.ts) — Renderer: creates a Collection using the Electron adapter
