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
        'commitlint.config.js',
        '**/examples/**',
        '**/docs/**',
        'packages/plugin-angular/src/index.ts', // disabled as it is currently not possible to test angular (see #306)
      ],
    },
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default',
  },
})
