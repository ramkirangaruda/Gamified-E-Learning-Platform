import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts deliberately -- that file's build/proxy config has
// nothing to do with running tests, and mixing them risks the test runner picking up
// build-only settings (or vice versa) as the project grows.
export default defineConfig({
  test: {
    environment: 'node', // headless Blockly.Workspace doesn't need a DOM; see compileAst.test.ts
  },
})
