import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'istanbul',
    },
    reporters: process.env.GITHUB_ACTIONS ? ['dot', 'github-actions'] : ['dot'],
  },
}))
