/**
 * Real E2E test for evalbuff.
 *
 * Creates a local git repo with a simple project, generates an eval task,
 * and runs the full evalbuff loop with real CLI coding agents and real
 * reviewer agents. No mocks.
 *
 * Prerequisites:
 *   - `claude` CLI installed and authenticated
 *   - (Optional) `codex` CLI installed with OPENAI_API_KEY set
 *
 * Usage:
 *   bun run evalbuff/src/run-e2e-test.ts
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { runEvalbuff } from './run-evalbuff'

import type { ReviewerAgentType } from './judge'
import type { EvalDataV2 } from './types'

// --- Setup ---

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-real-e2e-'))
const PROJECT_DIR = path.join(BASE_DIR, 'project')
const BARE_REPO = path.join(BASE_DIR, 'project.git')
const TARGET_DIR = path.join(BASE_DIR, 'target')

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

  // Create project directory
  fs.mkdirSync(PROJECT_DIR, { recursive: true })
  git('init', PROJECT_DIR)

  // Initial commit: a simple Node.js project with a bug
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

// BUG: subtract is wrong — it adds instead of subtracting
export function subtract(a, b) {
  return a + b
}

export function divide(a, b) {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
`,
  )

  fs.writeFileSync(
    path.join(PROJECT_DIR, 'test.js'),
    `import { add, subtract, multiply, divide } from './index.js'

let passed = 0
let failed = 0

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(\`  ✓ \${name}\`)
    passed++
  } else {
    console.log(\`  ✗ \${name}: expected \${expected}, got \${actual}\`)
    failed++
  }
}

console.log('Running tests...')
assert('add(2, 3)', add(2, 3), 5)
assert('multiply(3, 4)', multiply(3, 4), 12)
assert('subtract(10, 3)', subtract(10, 3), 7)
assert('divide(10, 2)', divide(10, 2), 5)

try {
  divide(1, 0)
  console.log('  ✗ divide by zero should throw')
  failed++
} catch (e) {
  console.log('  ✓ divide by zero throws')
  passed++
}

console.log(\`\\n\${passed} passed, \${failed} failed\`)
if (failed > 0) process.exit(1)
`,
  )

  git('add .', PROJECT_DIR)
  git('commit -m "Initial project with bug in subtract"', PROJECT_DIR)
  const parentSha = git('rev-parse HEAD', PROJECT_DIR)

  console.log(`  Parent commit (with bug): ${parentSha.slice(0, 8)}`)

  // Now create the ground truth fix
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

export function divide(a, b) {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
`,
  )

  git('add .', PROJECT_DIR)
  git('commit -m "Fix subtract function"', PROJECT_DIR)
  const fixSha = git('rev-parse HEAD', PROJECT_DIR)

  console.log(`  Fix commit (ground truth): ${fixSha.slice(0, 8)}`)

  // Get the diff for the ground truth
  const diff = git(`diff ${parentSha} ${fixSha} -- index.js`, PROJECT_DIR)

  // Create bare clone for withTestRepo to clone from
  execSync(`git clone --bare ${PROJECT_DIR} ${BARE_REPO}`, {
    stdio: 'ignore',
    env: { ...process.env, ...gitEnv },
  })
  console.log(`  Bare repo created at: ${BARE_REPO}`)

  return { parentSha, fixSha, diff }
}

function createEvalFile(parentSha: string, fixSha: string, diff: string) {
  console.log('\n=== Creating eval file ===')

  const evalData: EvalDataV2 = {
    repoUrl: `file://${BARE_REPO}`,
    generationDate: new Date().toISOString(),
    evalCommits: [
      {
        id: 'fix-subtract-bug',
        sha: fixSha,
        parentSha,
        spec: 'Fix the subtract function which incorrectly adds instead of subtracting',
        prompt:
          'The subtract function in index.js has a bug — it adds the two numbers instead of subtracting them. Fix it. Then run the tests to make sure they pass.',
        supplementalFiles: ['test.js'],
        fileDiffs: [
          {
            path: 'index.js',
            status: 'modified',
            diff,
          },
        ],
      },
    ],
  }

  const evalPath = path.join(BASE_DIR, 'eval.json')
  fs.writeFileSync(evalPath, JSON.stringify(evalData, null, 2))
  console.log(`  Eval file: ${evalPath}`)
  return evalPath
}

function setupTargetRepo() {
  console.log('\n=== Setting up target repo (for docs output) ===')

  fs.mkdirSync(TARGET_DIR, { recursive: true })
  git('init', TARGET_DIR)
  git('commit --allow-empty -m "init"', TARGET_DIR)
  console.log(`  Target repo: ${TARGET_DIR}`)
  return TARGET_DIR
}

function detectAvailableReviewers(): ReviewerAgentType[] {
  const reviewers: ReviewerAgentType[] = []

  try {
    execSync('which claude', { stdio: 'ignore' })
    reviewers.push('claude')
    console.log('  ✓ claude CLI found')
  } catch {
    console.log('  ✗ claude CLI not found')
  }

  try {
    execSync('which codex', { stdio: 'ignore' })
    if (process.env.OPENAI_API_KEY) {
      reviewers.push('codex')
      console.log('  ✓ codex CLI found (OPENAI_API_KEY set)')
    } else {
      console.log('  ✗ codex CLI found but OPENAI_API_KEY not set')
    }
  } catch {
    console.log('  ✗ codex CLI not found')
  }

  return reviewers
}

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   Evalbuff Real E2E Test                 ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`\nBase dir: ${BASE_DIR}`)

  // Detect available agents
  console.log('\n=== Detecting available agents ===')
  const reviewers = detectAvailableReviewers()

  if (reviewers.length === 0) {
    console.error('\nNo reviewer agents available. Need at least one of: claude, codex')
    process.exit(1)
  }

  // Detect coding agent
  let agentCommand = ''
  try {
    execSync('which claude', { stdio: 'ignore' })
    agentCommand = 'claude --dangerously-skip-permissions -p'
    console.log(`  Using coding agent: ${agentCommand}`)
  } catch {
    console.error('\nClaude CLI not found. Install with: npm install -g @anthropic-ai/claude-code')
    process.exit(1)
  }

  // Setup
  const { parentSha, fixSha, diff } = setupProject()
  const evalPath = createEvalFile(parentSha, fixSha, diff)
  const targetDir = setupTargetRepo()

  // Run evalbuff
  console.log('\n=== Running evalbuff ===')
  console.log(`  Agent: ${agentCommand}`)
  console.log(`  Reviewers: ${reviewers.join(', ')}`)
  console.log(`  Task: fix-subtract-bug`)
  console.log('')

  const startTime = Date.now()

  try {
    await runEvalbuff({
      repoPath: targetDir,
      agentCommand,
      evalDataPaths: [evalPath],
      maxIterations: 1,
      maxCostUsd: 10,
      scoreThreshold: 7.0,
      agentTimeoutMs: 5 * 60 * 1000, // 5 min for the coding agent
      reviewerAgents: reviewers,
    })
  } catch (error) {
    console.error('\nEvalbuff failed:', error)
  }

  const durationMs = Date.now() - startTime

  // Verify results
  console.log('\n=== Verifying results ===')

  const logPath = path.join(targetDir, 'evalbuff-log.jsonl')
  if (fs.existsSync(logPath)) {
    const logContent = fs.readFileSync(logPath, 'utf-8').trim()
    if (logContent) {
      const entries = logContent.split('\n').map((l) => JSON.parse(l))
      console.log(`  Log entries: ${entries.length}`)
      for (const entry of entries) {
        console.log(`  Task: ${entry.taskId}`)
        console.log(`    Old score: ${entry.oldScore}`)
        console.log(`    New score: ${entry.newScore ?? 'N/A'}`)
        console.log(`    Doc edit: ${entry.docEdit ? entry.docEdit.path : 'none'}`)
        console.log(`    Score comparison: ${entry.scoreComparison ?? 'N/A'}`)
        console.log(`    Duration: ${(entry.durationMs / 1000).toFixed(1)}s`)
        console.log(`    Error: ${entry.error ?? 'none'}`)
      }
    } else {
      console.log('  ✗ Log file is empty')
    }
  } else {
    console.log('  ✗ Log file not found')
  }

  // Check morning report
  const reportFiles = fs
    .readdirSync(targetDir)
    .filter((f) => f.startsWith('evalbuff-report-'))
  if (reportFiles.length > 0) {
    console.log(`\n  ✓ Morning report: ${reportFiles[0]}`)
    const report = fs.readFileSync(
      path.join(targetDir, reportFiles[0]),
      'utf-8',
    )
    console.log('\n--- Morning Report ---')
    console.log(report)
    console.log('--- End Report ---')
  } else {
    console.log('  ✗ No morning report generated')
  }

  // Check docs
  const docsDir = path.join(targetDir, 'docs')
  if (fs.existsSync(docsDir)) {
    const docFiles = execSync(`find ${docsDir} -name '*.md'`, {
      encoding: 'utf-8',
    }).trim()
    if (docFiles) {
      console.log(`\n  ✓ Docs generated:`)
      for (const f of docFiles.split('\n')) {
        console.log(`    ${f}`)
      }
    }
  }

  // Check state
  const statePath = path.join(targetDir, 'evalbuff-state.json')
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    console.log(`\n  ✓ State: ${state.completedTaskIds.length} completed, $${state.totalCostUsd.toFixed(2)} spent`)
  }

  console.log(`\n=== E2E test completed in ${(durationMs / 1000).toFixed(1)}s ===`)
  console.log(`Base dir (for inspection): ${BASE_DIR}`)

  // Cleanup prompt
  console.log(`\nTo clean up: rm -rf ${BASE_DIR}`)
}

main().catch((error) => {
  console.error('E2E test failed:', error)
  process.exit(1)
})
