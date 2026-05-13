import { defineConfig } from 'vite'
import ts from '@rollup/plugin-typescript'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    ts({
      tsconfig: './tsconfig.json'
    })
  ],
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'lighting-element',
      fileName: (format) => `index.${format}.js`
    }
  }
})
