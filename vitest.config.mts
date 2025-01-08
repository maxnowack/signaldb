import { defineConfig } from 'vitest/config'
import GithubActionsReporter from 'vitest-github-actions-reporter'

export default defineConfig({
  test: {
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
      ],
    },
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default',
  },
})
