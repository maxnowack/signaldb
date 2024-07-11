// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import GithubActionsReporter from 'vitest-github-actions-reporter'

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      exclude: [
        '.eslintrc.js',
        '**/*.spec.ts',
        '**/dist/**',
        '**/docs/**',
        '**/examples/**',
        '**/node_modules/**',
        '**/vite.config.ts',
        'commitlint.config.js',
      ],
    },
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default',
  },
})
