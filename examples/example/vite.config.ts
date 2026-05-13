import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      'lighting-element': path.resolve(__dirname, '../../packages/lighting-element/src/index.ts')
    }
  }
})
