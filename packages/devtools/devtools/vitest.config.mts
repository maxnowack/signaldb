import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'istanbul',
    },
  },
}))
