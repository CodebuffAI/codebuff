import { resolve } from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The renderer lives under src/app/ui. In dev, Vite serves it on a fixed port and
// proxies /api + /preview to the Bun orchestrator (pinned to PORT=8787). In the
// packaged app, `vite build` emits dist-ui/ which the Bun server serves at `/`.
export default defineConfig({
  root: resolve(__dirname, 'src/app/ui'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-ui'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/preview': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/thread-preview': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
