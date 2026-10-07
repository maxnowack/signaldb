import { vi } from 'vitest'

// Node 22+ defines its own global `localStorage`, which is unusable without
// `--localstorage-file` and shadows the one happy-dom provides.
const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})
