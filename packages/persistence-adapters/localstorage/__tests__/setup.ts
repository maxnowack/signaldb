import { Window } from 'happy-dom'

// Node defines a `localStorage` global that is unusable without the
// `--localstorage-file` flag. Because the global already exists, the happy-dom
// environment skips it when populating globals, so it has to be installed here.
Object.defineProperty(globalThis, 'localStorage', {
  value: new Window().localStorage,
  configurable: true,
  writable: true,
})
