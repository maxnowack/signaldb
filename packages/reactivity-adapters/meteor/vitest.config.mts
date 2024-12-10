import { defineConfig, mergeConfig } from 'vitest/config'
import GithubActionsReporter from 'vitest-github-actions-reporter'
import viteConfig from './vite.config.mts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
    },
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default',
  },
}))
