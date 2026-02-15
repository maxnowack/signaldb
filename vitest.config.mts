import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    retry: 3,
    projects: [
      'packages/base/*',
      'packages/devtools/*',
      'packages/integrations/*',
      'packages/storage-adapters/*',
      'packages/reactivity-adapters/*',
    ],
    coverage: {
      provider: 'istanbul',
      exclude: [
        '**/*.spec.ts',
        '**/dist/**',
        '**/docs/**',
        '**/examples/**',
        '**/node_modules/**',
        '**/vite.config.mts',
        '**/vitest.config.mts',
        'commitlint.config.js',
        'eslint.config.mjs',
        'packages/devtools/devtools',
      ],
      thresholds: {
        lines: 100,
      },
    },
    reporters: process.env.GITHUB_ACTIONS ? ['dot', 'junit', 'github-actions'] : ['dot'],
  },
})
