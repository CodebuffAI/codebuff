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
    // Bind the IPv4 loopback explicitly. Vite's default `localhost` resolves to
    // ::1 (IPv6) on many machines, but the dev launcher's readiness probe and
    // Electron's loadURL both target 127.0.0.1 — a v6-only bind makes them miss,
    // so the launcher times out and orphans Vite while the orchestrator never
    // starts (every /api call then ECONNREFUSEs on 8787).
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/preview': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/thread-preview': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
