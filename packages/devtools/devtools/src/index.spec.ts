// @vitest-environment node
import path from 'node:path'
import { build } from 'vite'
import type { Rolldown } from 'vite'
import { it, expect } from 'vitest'

it('is not dropped by a bundler when imported only for its side effect', async () => {
  const entry = '\0entry.js'
  const output = await build({
    configFile: false,
    root: path.resolve(__dirname, '..'),
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      rolldownOptions: {
        input: entry,
        external: importPath => /^[^./\0]/.test(importPath) && importPath !== '@signaldb/devtools',
      },
    },
    plugins: [{
      name: 'side-effect-import-entry',
      resolveId: id => (id === entry ? entry : null),
      load: id => (id === entry ? 'import \'@signaldb/devtools\'' : null),
    }],
  }) as Rolldown.RolldownOutput

  const code = output.output
    .filter(chunk => chunk.type === 'chunk')
    .map(chunk => chunk.code)
    .join('\n')
  expect(code).toContain('enableDebugMode')
})
