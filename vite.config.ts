// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest" />
import path from 'path'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import typescript from '@rollup/plugin-typescript'
import { typescriptPaths } from 'rollup-plugin-typescript-paths'
import dts from 'vite-plugin-dts'
import tsconfigPaths from 'vite-tsconfig-paths'
import GithubActionsReporter from 'vitest-github-actions-reporter'

export default defineConfig({
  plugins: [
    dts(),
    tsconfigPaths(),
    nodePolyfills(),
  ],
  test: {
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default',
  },
  // resolve: {
  //   alias: {
  //     events: 'rollup-plugin-polyfill-node/polyfills/events',
  //   },
  build: {
    manifest: true,
    minify: true,
    reportCompressedSize: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SignalDB',
      fileName: format => `index.${format}.js`,
    },
    rollupOptions: {
      external: [],
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
