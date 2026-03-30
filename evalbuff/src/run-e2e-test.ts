/**
 * Real E2E test for evalbuff.
 *
 * Creates a local git repo with a simple project, then runs evalbuff's
 * learn mode against it using real CLI coding agents and real reviewer agents.
 * No mocks.
 *
 * Prerequisites:
 *   - `claude` CLI installed and authenticated
 *   - `codebuff` CLI installed
 *   - (Optional) `codex` CLI installed with OPENAI_API_KEY set
 *
 * Usage:
 *   bun run evalbuff/src/run-e2e-test.ts
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { runLearnMode } from './run-evalbuff'

import type { ReviewerAgentType } from './judge'

// --- Setup ---

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-real-e2e-'))
const PROJECT_DIR = path.join(BASE_DIR, 'project')

const gitEnv = {
  GIT_AUTHOR_NAME: 'evalbuff-test',
  GIT_AUTHOR_EMAIL: 'test@evalbuff.dev',
  GIT_COMMITTER_NAME: 'evalbuff-test',
  GIT_COMMITTER_EMAIL: 'test@evalbuff.dev',
}

function git(cmd: string, cwd: string) {
  return execSync(`git ${cmd}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...gitEnv },
  }).trim()
}

function setupProject() {
  console.log('\n=== Setting up test project ===')

  fs.mkdirSync(PROJECT_DIR, { recursive: true })
  git('init', PROJECT_DIR)

  // Initial commit
  fs.writeFileSync(
    path.join(PROJECT_DIR, 'package.json'),
    JSON.stringify(
      {
        name: 'evalbuff-test-project',
        version: '1.0.0',
        type: 'module',
        scripts: {
          test: 'node test.js',
          start: 'node index.js',
        },
      },
      null,
      2,
    ),
  )

  fs.writeFileSync(
    path.join(PROJECT_DIR, 'index.js'),
    `// Simple math utility
export function add(a, b) {
  return a + b
}

export function multiply(a, b) {
  return a * b
}
`,
  )

  fs.writeFileSync(
    path.join(PROJECT_DIR, 'test.js'),
    `import { add, multiply } from './index.js'

let passed = 0
let failed = 0

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(\`  pass: \${name}\`)
    passed++
  } else {
    console.log(\`  fail: \${name}: expected \${expected}, got \${actual}\`)
    failed++
  }
}

console.log('Running tests...')
assert('add(2, 3)', add(2, 3), 5)
assert('multiply(3, 4)', multiply(3, 4), 12)

console.log(\`\\n\${passed} passed, \${failed} failed\`)
if (failed > 0) process.exit(1)
`,
  )

  git('add .', PROJECT_DIR)
  git('commit -m "Initial project with add and multiply"', PROJECT_DIR)

  // Second commit: add subtract (with a bug)
  fs.writeFileSync(
    path.join(PROJECT_DIR, 'index.js'),
    `// Simple math utility
export function add(a, b) {
  return a + b
}

export function multiply(a, b) {
  return a * b
}

// BUG: adds instead of subtracting
export function subtract(a, b) {
  return a + b
}
`,
  )

  git('add .', PROJECT_DIR)
  git('commit -m "Add subtract function (has bug)"', PROJECT_DIR)

  // Third commit: fix the bug
  fs.writeFileSync(
    path.join(PROJECT_DIR, 'index.js'),
    `// Simple math utility
export function add(a, b) {
  return a + b
}

export function multiply(a, b) {
  return a * b
}

export function subtract(a, b) {
  return a - b
}
`,
  )

  fs.writeFileSync(
    path.join(PROJECT_DIR, 'test.js'),
    `import { add, multiply, subtract } from './index.js'

let passed = 0
let failed = 0

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(\`  pass: \${name}\`)
    passed++
  } else {
    console.log(\`  fail: \${name}: expected \${expected}, got \${actual}\`)
    failed++
  }
}

console.log('Running tests...')
assert('add(2, 3)', add(2, 3), 5)
assert('multiply(3, 4)', multiply(3, 4), 12)
assert('subtract(10, 3)', subtract(10, 3), 7)

console.log(\`\\n\${passed} passed, \${failed} failed\`)
if (failed > 0) process.exit(1)
`,
  )

  git('add .', PROJECT_DIR)
  git('commit -m "Fix subtract bug and add test"', PROJECT_DIR)

  // Add a remote pointing to itself (learn mode needs git remote get-url)
  git(`remote add origin file://${PROJECT_DIR}`, PROJECT_DIR)

  const commitCount = parseInt(
    git('rev-list --count HEAD', PROJECT_DIR),
  )
  console.log(`  Project dir: ${PROJECT_DIR}`)
  console.log(`  Commits: ${commitCount}`)
}

function detectAvailableReviewers(): ReviewerAgentType[] {
  const reviewers: ReviewerAgentType[] = []

  try {
    execSync('which claude', { stdio: 'ignore' })
    reviewers.push('claude')
    console.log('  reviewer: claude')
  } catch {
    console.log('  claude not found')
  }

  try {
    execSync('which codex', { stdio: 'ignore' })
    if (process.env.OPENAI_API_KEY) {
      reviewers.push('codex')
      console.log('  reviewer: codex')
    }
  } catch {
    // skip
  }

  return reviewers
}

async function main() {
  console.log('Evalbuff Real E2E Test')
  console.log(`Base dir: ${BASE_DIR}`)

  console.log('\n=== Detecting available agents ===')
  const reviewers = detectAvailableReviewers()

  if (reviewers.length === 0) {
    console.error('No reviewer agents available. Need at least: claude')
    process.exit(1)
  }

  setupProject()

  // Run evalbuff learn mode against the project's own history
  console.log('\n=== Running evalbuff learn mode ===')

  const startTime = Date.now()

  try {
    await runLearnMode({
      mode: 'learn',
      repoPath: PROJECT_DIR,
      agentId: 'base2-free-evals',
      parallelism: 2,
      maxCostUsd: 10,
      agentTimeoutMs: 5 * 60 * 1000,
      commitCount: 10, // only 3 commits in this repo
      reviewerAgents: reviewers,
    })
  } catch (error) {
    console.error('Evalbuff failed:', error)
  }

  const durationMs = Date.now() - startTime

  // Verify results
  console.log('\n=== Results ===')

  const logPath = path.join(PROJECT_DIR, 'evalbuff-log.jsonl')
  if (fs.existsSync(logPath)) {
    const logContent = fs.readFileSync(logPath, 'utf-8').trim()
    if (logContent) {
      const entries = logContent.split('\n').map((l) => JSON.parse(l))
      console.log(`  Log entries: ${entries.length}`)
      for (const entry of entries) {
        console.log(`  Commit: ${entry.taskId}`)
        console.log(`    Baseline: ${entry.oldScore}`)
        console.log(`    After docs: ${entry.newScore ?? 'N/A'}`)
        console.log(`    Docs: ${entry.docEdit ? entry.docEdit.path : 'none'}`)
      }
    }
  }

  const statePath = path.join(PROJECT_DIR, 'evalbuff-state.json')
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    console.log(`  Processed: ${state.processedCommitCount} commits`)
    console.log(`  Cost: $${state.totalCostUsd.toFixed(2)}`)
  }

  const docsDir = path.join(PROJECT_DIR, 'docs')
  if (fs.existsSync(docsDir)) {
    const docs = execSync(`find ${docsDir} -name '*.md'`, { encoding: 'utf-8' }).trim()
    if (docs) {
      console.log(`  Docs generated:`)
      for (const f of docs.split('\n')) {
        console.log(`    ${f}`)
      }
    }
  }

  console.log(`\nCompleted in ${(durationMs / 1000).toFixed(1)}s`)
  console.log(`Inspect: ${PROJECT_DIR}`)
  console.log(`Cleanup: rm -rf ${BASE_DIR}`)
}

main().catch((error) => {
  console.error('E2E test failed:', error)
  process.exit(1)
})
