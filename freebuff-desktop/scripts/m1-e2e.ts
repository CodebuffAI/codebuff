/**
 * M1 end-to-end: run the REAL test stage (planner agent + web_test browser harness
 * + deterministic gate) against a known-bad and known-good web build, and confirm
 * the gate blocks the broken one and passes the working one.
 *
 *   NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3000 \
 *     bun freebuff-desktop/scripts/m1-e2e.ts
 */

import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { CodebuffClient } from '@codebuff/sdk'

import { buildStageExecutors } from '../src/app/agents/stage-agents'
import { bunRunner } from '../src/core/exec'
import { Store } from '../src/core/store'
import { WorktreeManager } from '../src/core/worktree'

const repo = mkdtempSync(join(tmpdir(), 'm1repo-'))
const git = (a: string[]) => bunRunner.run('git', ['-C', repo, ...a], {})
await bunRunner.run('git', ['init', '-b', 'main', repo], {})
await git(['config', 'user.email', 't@t.com'])
await git(['config', 'user.name', 'T'])
writeFileSync(join(repo, 'index.html'), '<!doctype html><html><body><h1>start</h1></body></html>')
await git(['add', '-A'])
await git(['commit', '-m', 'init'])

const store = new Store(':memory:')
store.insertProject({ id: 'p', repoUrl: repo, rootPath: repo, createdAt: 1 })
const worktrees = new WorktreeManager({ repoRoot: repo, defaultBranch: 'main' })
const client = new CodebuffClient({ apiKey: process.env.CODEBUFF_API_KEY })
const ex = buildStageExecutors({ client, worktrees, store })
const project = store.getProject('p')!

async function runCase(name: string, html: string) {
  const id = 't_' + name
  store.insertTask({ id, projectId: 'p', title: 'Render a green box on a canvas', description: 'The page should draw a filled green square on the canvas when it loads.', origin: 'human', createdAt: 2 })
  const { worktreePath } = await worktrees.create(id, name)
  writeFileSync(join(worktreePath, 'index.html'), html)
  const out = await ex.test.run({ task: store.getTask(id)!, project, guidance: [] })
  const art = store.getArtifacts(id)
  console.log(`\n[RESULT ${name}] outcome=${out.kind}` +
    (out.kind === 'blocked' ? ` reason="${out.reason.slice(0, 140)}"` : '') +
    ` | screenshot=${art.testScreenshot ? art.testScreenshot.length + 'b64' : 'none'}` +
    ` | evidence="${(art.testEvidence || '').slice(0, 100)}"`)
}

// BAD: temporal-dead-zone — draw() uses C before it's declared → blank screen.
await runCase('BAD', '<!doctype html><html><body><canvas id=c></canvas><script>function d(){document.getElementById("c").getContext("2d").fillStyle=C[0];document.getElementById("c").getContext("2d").fillRect(0,0,80,80)} d(); const C=["#0f0"];</script></body></html>')
// GOOD: draws the green box correctly.
await runCase('GOOD', '<!doctype html><html><body><canvas id=c width=100 height=100></canvas><script>const C=["#0f0"];const x=document.getElementById("c").getContext("2d");x.fillStyle=C[0];x.fillRect(0,0,100,100);</script></body></html>')
process.exit(0)
