/**
 * Seed a throwaway repo + desktop.db with a mix of tasks — including Scout
 * proposals stamped with `spawnedFrom` — so the UI can be eyeballed locally:
 *
 *   bun scripts/seed-demo.ts            # prints the repo path
 *   TARGET_REPO=<path> ENABLE_SCOUT=0 PORT=8788 bun src/app/server.ts
 */
import { execSync } from 'child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { Store } from '../src/core/store'

const root = mkdtempSync(join(tmpdir(), 'fbd-demo-'))
execSync('git init -q && git add -A && git commit -q --allow-empty -m init', { cwd: root })
writeFileSync(join(root, 'index.html'), '<h1>demo</h1>')

mkdirSync(join(root, '.freebuff'), { recursive: true })
const store = new Store(join(root, '.freebuff', 'desktop.db'))
store.insertProject({
  id: 'project',
  repoUrl: 'github.com/acme/desktop-demo',
  rootPath: root,
  dailyBudget: 1_000_000,
  concurrencyCap: 2,
  createdAt: 1,
})

let n = 0
const mk = (p: Parameters<Store['insertTask']>[0]) =>
  store.insertTask({ projectId: 'project', createdAt: ++n, origin: 'human', ...p })

// Two shipped parents, each with a few Scout follow-ups grouped beneath them.
mk({ id: 'auth', title: 'Add Google sign-in', description: 'OAuth login', status: 'merged' })
mk({ id: 'p-a1', title: 'Add sign-out button', description: 'd', status: 'proposed', origin: 'scout', spawnedFrom: 'auth', rationale: 'Users who can log in need a way to log out.' })
mk({ id: 'p-a2', title: 'Persist session across reloads', description: 'd', status: 'proposed', origin: 'scout', spawnedFrom: 'auth', rationale: 'Keep users logged in after refresh.' })
mk({ id: 'p-a3', title: 'Show avatar in the header', description: 'd', status: 'proposed', origin: 'scout', spawnedFrom: 'auth', rationale: 'Surface who is signed in.' })

mk({ id: 'score', title: 'High-score tracking', description: 'localStorage scores', status: 'awaiting-approval' })
mk({ id: 'p-s1', title: 'Add a leaderboard view', description: 'd', status: 'proposed', origin: 'scout', spawnedFrom: 'score', rationale: 'Make the stored scores visible.' })
mk({ id: 'p-s2', title: 'Reset-scores button', description: 'd', status: 'proposed', origin: 'scout', spawnedFrom: 'score', rationale: 'Let players clear the board.' })

// A human-proposed task with no parent → "Other suggestions".
mk({ id: 'p-h1', title: 'Dark-mode toggle', description: 'd', status: 'proposed', rationale: 'Requested by users.' })

// A running task + a ready one, so the other columns render too.
mk({ id: 'run1', title: 'Refactor canvas loop', description: 'd', status: 'running', stage: 'implement' as any })

store.close()
console.log(root)
