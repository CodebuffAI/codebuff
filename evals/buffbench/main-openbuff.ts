import fs from 'fs'
import os from 'os'
import path from 'path'

import { runBuffBench } from './run-buffbench'

/**
 * Openbuff-authored buffbench runner.
 *
 * Runs `eval-openbuff-v2.json` — a buffbench eval set regenerated from the
 * openbuff repo's own commit history (8 commits selected via the
 * `pick-commits` LLM screening pipeline). This complements
 * `eval-codebuff.json` (inherited upstream Codebuff commits repointed at
 * `AnzoBenjamin/openbuff`); the two coexist so we can measure regression
 * against both inherited upstream history and our own-authored history.
 *
 * ## Portability: OPENBUFF_REPO_PATH
 *
 * `eval-openbuff-v2.json` is generated against a `file://` URL pointing at
 * the developer's local openbuff worktree, which is not portable across
 * contributors. To make the runner portable, set `OPENBUFF_REPO_PATH` to the
 * absolute path of your local openbuff checkout:
 *
 *   OPENBUFF_REPO_PATH=/home/<user>/Code/CLI/openbuff bun run main-openbuff.ts
 *
 * When set, the runner overrides the eval JSON's `repoUrl` with
 * `file://<OPENBUFF_REPO_PATH>` (a local clone — fast, network-free). When
 * unset, the runner falls back to the `repoUrl` embedded in
 * `eval-openbuff-v2.json`.
 *
 * Usage:
 *   bun run main-openbuff.ts [--save-traces] [--task-concurrency=N]
 */
async function main() {
  const saveTraces = process.argv.includes('--save-traces')
  const taskConcurrencyArg = process.argv.find((a) =>
    a.startsWith('--task-concurrency='),
  )
  const taskConcurrency = taskConcurrencyArg
    ? parseInt(taskConcurrencyArg.split('=')[1], 10)
    : 6

  // Resolve the eval JSON path, applying the OPENBUFF_REPO_PATH portability
  // override if the env var is set.
  const embeddedEvalPath = path.join(__dirname, 'eval-openbuff-v2.json')
  const repoPathOverride = process.env.OPENBUFF_REPO_PATH
  let evalDataPath = embeddedEvalPath

  if (repoPathOverride) {
    // Normalize the override path to an absolute file:// URL.
    const absRepoPath = path.resolve(repoPathOverride)
    if (
      !fs.existsSync(absRepoPath) ||
      !fs.existsSync(path.join(absRepoPath, '.git'))
    ) {
      throw new Error(
        `OPENBUFF_REPO_PATH="${repoPathOverride}" does not point at a valid openbuff git worktree (expected a directory containing a .git entry).`,
      )
    }
    const overrideUrl = `file://${absRepoPath}`

    // Load the embedded eval JSON, override repoUrl, and write to a temp file
    // so runBuffBench (which reads repoUrl from the eval JSON) picks up the
    // local clone path.
    const evalData = JSON.parse(fs.readFileSync(embeddedEvalPath, 'utf-8')) as {
      repoUrl: string
    }
    const originalUrl = evalData.repoUrl
    evalData.repoUrl = overrideUrl

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-eval-'))
    evalDataPath = path.join(tempDir, 'eval-openbuff-v2.override.json')
    fs.writeFileSync(evalDataPath, JSON.stringify(evalData, null, 2))

    console.log(`OPENBUFF_REPO_PATH override: ${overrideUrl}`)
    console.log(`  (replaced embedded repoUrl: ${originalUrl})`)
    console.log(`  temp eval file: ${evalDataPath}`)
  }

  console.log('Starting openbuff-authored buffbench evaluation...')
  console.log('Eval set: openbuff-v2 (8 openbuff-authored commits)')
  console.log()

  try {
    await runBuffBench({
      evalDataPaths: [evalDataPath],
      agents: ['base2'],
      taskConcurrency,
      saveTraces,
    })
  } finally {
    // Clean up the temp override file if we created one.
    if (evalDataPath !== embeddedEvalPath) {
      try {
        fs.rmSync(path.dirname(evalDataPath), { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running openbuff buffbench:', error)
    process.exit(1)
  })
}
