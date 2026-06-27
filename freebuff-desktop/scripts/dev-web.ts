/**
 * Browser dev launcher: runs the full web stack WITHOUT Electron, so you can open
 * the app in a normal browser at http://localhost:5174.
 *
 * It starts the Bun orchestrator (pinned to PORT=8787) and the Vite dev server.
 * Vite proxies /api + /preview to the orchestrator, so the renderer has a live
 * backend — without this, opening 5174 alone gives a UI stuck on "No threads
 * open" because every /api call hits a dead proxy (ECONNREFUSED on 8787).
 *
 *   bun run dev:web   →  open http://localhost:5174
 *
 * For the Electron shell instead, use `bun run dev` (or `bun run app`).
 */

import { run } from './_procs'

// 8787 is the port Vite's proxy targets (see vite.config.ts).
run('orchestrator', ['bun', 'src/app/server.ts'], { PORT: '8787' })
run('vite', ['bunx', 'vite'])

console.log('\nFreebuff Desktop (web) → open http://localhost:5174\n')
