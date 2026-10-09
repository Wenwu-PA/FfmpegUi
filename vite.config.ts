import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
  test: { environment: 'node', exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'] },
})
