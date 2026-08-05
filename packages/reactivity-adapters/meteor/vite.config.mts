/// <reference types="vitest" />
import path from 'path'
import { defineConfig } from 'vite'
import { typescriptPaths } from 'rollup-plugin-typescript-paths'
import tsconfigPaths from 'vite-tsconfig-paths'
import { createDtsPlugin } from '../../../vite.config.shared.mts'

export default defineConfig({
  plugins: [
    createDtsPlugin(__dirname),
    tsconfigPaths(),
  ],
  build: {
    manifest: true,
    minify: true,
    sourcemap: true,
    reportCompressedSize: true,
    lib: {
      name: 'SignalDB',
      entry: path.resolve(__dirname, 'src/index.ts'),
      fileName: format => (format === 'es' ? 'index.mjs' : `index.${format}.js`),
    },
    rollupOptions: {
      external: [
        '@signaldb/core',
        'meteor-ts-tracker',
      ],
      plugins: [
        typescriptPaths({
          preserveExtensions: true,
        }),
      ],
    },
  },
})
