// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import GithubActionsReporter from 'vitest-github-actions-reporter'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default',
  },
})
