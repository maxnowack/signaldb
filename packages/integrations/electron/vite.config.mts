/// <reference types="vitest" />
import path from 'path'
import { defineConfig } from 'vite'
import typescript from '@rollup/plugin-typescript'
import { typescriptPaths } from 'rollup-plugin-typescript-paths'
import dts from 'vite-plugin-dts'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    dts(),
    tsconfigPaths(),
  ],
  build: {
    manifest: true,
    minify: true,
    sourcemap: true,
    reportCompressedSize: true,
    lib: {
      name: 'SignalDB',
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        main: path.resolve(__dirname, 'src/main.ts'),
        preload: path.resolve(__dirname, 'src/preload.ts'),
        renderer: path.resolve(__dirname, 'src/renderer.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => (format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`),
    },
    rollupOptions: {
      external: [
        '@signaldb/core',
        'electron',
      ],
      plugins: [
        typescriptPaths({
          preserveExtensions: true,
        }),
        typescript({
          sourceMap: false,
          declaration: true,
          outDir: 'dist',
        }),
      ],
    },
  },
})
