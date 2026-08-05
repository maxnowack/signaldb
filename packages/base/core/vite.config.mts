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
    minify: false,
    sourcemap: false,
    reportCompressedSize: true,
    lib: {
      name: 'SignalDB',
      entry: path.resolve(__dirname, 'src/index.ts'),
      fileName: format => (format === 'es' ? 'index.mjs' : `index.${format}.js`),
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: false,
        preserveModules: true,
        format: 'es',
      },
      external: [
        '@signaldb/devtools',
        'fast-sort',
        'mingo',
        'mingo/updater',
      ],
      plugins: [
        typescriptPaths({
          preserveExtensions: true,
        }),
      ],
    },
  },
})
