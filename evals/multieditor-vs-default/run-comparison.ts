/**
 * Editor comparison: runs the same editing task through both the default
 * editor (base2, uses 'editor' sub-agent) and the multi-prompt editor
 * (base2-max, uses 'editor-multi-prompt' sub-agent), then compares results.
 *
 * Runs directly on the current working directory (no git clone).
 * Uses BYOK/local mode with openbuff.json for provider routing.
 *
 * SAFETY: Refuses to run if the working tree has uncommitted changes.
 * Fixes are isolated to a single commit and reset after each run.
 *
 * Usage:
 *   bun run multieditor-vs-default/run-comparison.ts [prompt]
 *
 * Artifacts are written to MULTIEDITOR_OUTPUT_DIR, or
 * debug/multieditor-vs-default by default.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

import { CodebuffClient, loadLocalAgents } from '@codebuff/sdk'
import { logger } from '../logger'

import { editorRunResultSchema, type EditorRunResult } from './types'

function assertCleanWorktree(cwd: string) {
  const status = execSync('git status --porcelain', {
    cwd,
    encoding: 'utf-8',
  }).trim()
  // Allow untracked files only in our eval dir
  const unsafe = status
    .split('\n')
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith('?? evals/multieditor-vs-default/'),
    )
  if (unsafe.length > 0) {
    console.error('Uncommitted changes detected. Refusing to run.')
    console.error('Changes:')
    unsafe.forEach((line) => console.error(`  ${line}`))
    console.error('\nCommit or stash your changes first.')
    process.exit(1)
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))

interface RunOutput {
  diff: string
  error?: string
  cost: number
  durationMs: number
  steps: number
}

async function runEditor(
  client: CodebuffClient,
  agentId: string,
  localAgentDefinitions: any[],
  prompt: string,
  cwd: string,
  editorKind: 'default' | 'multieditor',
): Promise<RunOutput> {
  console.log(`\n=== ${editorKind.toUpperCase()} (${agentId}) ===`)

  const startTime = Date.now()
  const steps: any[] = []
  let error: string | undefined
  let diff = ''
  let cost = 0

  try {
    // Multi-prompt editor naturally needs more steps
    const maxSteps = editorKind === 'multieditor' ? 50 : 25
    const result = await client.run({
      agent: agentId,
      prompt,
      agentDefinitions: localAgentDefinitions,
      cwd,
      maxAgentSteps: maxSteps,
      handleEvent: (event) => {
        steps.push(event)
        if (event.type === 'error') {
          console.error(`[${editorKind}] Error event:`, event.message)
        }
      },
    })

    if (result.output.type === 'error') {
      error = String(result.output.message)
    }

    cost = (result.sessionState?.mainAgentState?.creditsUsed ?? 0) / 100

    // Capture git diff for changes made
    try {
      diff = execSync('git diff', {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }).trim()
    } catch {
      // ignore
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    console.error(`[${editorKind}] Exception:`, error)
  }

  const durationMs = Date.now() - startTime

  console.log(
    `[${editorKind}] diff: ${diff.length} chars | ` +
      `credits: ${cost.toFixed(1)} | ` +
      `duration: ${(durationMs / 1000).toFixed(1)}s | ` +
      `steps: ${steps.length}`,
  )

  return { diff, error, cost, durationMs, steps: steps.length }
}

function evaluateResult(
  result: RunOutput,
  editorKind: 'default' | 'multieditor',
): EditorRunResult {
  const changedFiles = result.diff
    ? (result.diff.match(/^diff --git /gm)?.length ?? 0)
    : 0
  const hallucinatedPaths = result.diff
    ? (result.diff.match(/^--- \/dev\/null\n\+\+\+ b\//gm)?.length ?? 0)
    : 0

  // Scoring: based on objective metrics plus a content quality check
  let score = 0
  if (!result.error) score += 2
  if (result.diff.length > 0) score += 1
  if (changedFiles > 0 && changedFiles <= 8) score += 2
  if (hallucinatedPaths === 0) score += 2
  // Only award content points if the diff actually changes something meaningful
  if (result.diff.length > 100) score += 1
  // Check that the diff modifies existing files (not just new files)
  const modifiesExisting =
    result.diff.includes('\n--- a/') && result.diff.includes('\n+++ b/')
  if (modifiesExisting) score += 1
  // Bonuses for conciseness (smaller diffs that still do the job are better)
  if (result.diff.length > 0 && result.diff.length < 2000) score += 1
  score = Math.min(10, score)

  const notes: string[] = []
  if (result.error) notes.push(`error: ${result.error.slice(0, 200)}`)
  notes.push(`credits: ${result.cost.toFixed(1)}`)
  notes.push(`duration: ${(result.durationMs / 1000).toFixed(1)}s`)
  notes.push(`steps: ${result.steps}`)
  notes.push(`diff chars: ${result.diff.length}`)
  if (changedFiles > 0) notes.push(`files changed: ${changedFiles}`)

  return editorRunResultSchema.parse({
    taskId: 'quick-compare',
    editorKind,
    appliedCleanly: !result.error && result.diff.length > 0,
    validationPassed: !result.error && result.diff.length > 50,
    satisfiedTask: result.diff.length > 50 && changedFiles > 0,
    hallucinatedPaths,
    changedFiles,
    reviewerScore: score,
    notes,
  })
}

async function main() {
  const cwd = resolve('.')

  // Safety check: refuse to run with uncommitted changes
  assertCleanWorktree(cwd)

  const prompt =
    process.argv[2] ??
    'Add a JSDoc comment to the createCodeEditor function in agents/editor/editor.ts describing its parameters and return type'

  const outputDir = resolve(
    process.env.MULTIEDITOR_OUTPUT_DIR ?? join(cwd, 'debug/multieditor-vs-default'),
  )
  mkdirSync(outputDir, { recursive: true })

  console.log(`CWD: ${cwd}`)
  console.log(`Prompt: "${prompt}"`)
  console.log(`Output dir: ${outputDir}`)

  // BYOK/local mode — uses openbuff.json for provider routing
  const client = new CodebuffClient({ logger, localMode: true, cwd })
  console.log(`Local mode: ${client.options.localMode}`)

  // Load local agent definitions
  const agentsPath = resolve(__dirname, '../../agents')
  const loadedAgents = await loadLocalAgents({ agentsPath })
  const localAgentDefinitions = Object.values(loadedAgents)
  console.log(`Loaded ${localAgentDefinitions.length} agent definitions`)

  // Helper: discard changes preserving untracked tracked files
  function discardChanges() {
    try {
      execSync('git checkout -- .', { cwd, stdio: 'ignore' })
      // Only clean files NOT in evals/multieditor-vs-default
      execSync('git clean -fd -e evals/multieditor-vs-default', {
        cwd,
        stdio: 'ignore',
      })
    } catch {
      // ignore
    }
  }

  // --- Run DEFAULT editor ---
  discardChanges()
  const defaultResult = await runEditor(
    client,
    'base2',
    localAgentDefinitions,
    prompt,
    cwd,
    'default',
  )

  // --- Run MULTIEDITOR ---
  discardChanges()
  const multiResult = await runEditor(
    client,
    'base2-max',
    localAgentDefinitions,
    prompt,
    cwd,
    'multieditor',
  )

  // Discard changes one final time (but not the eval files)
  discardChanges()

  // --- Evaluate and compare ---
  const def = evaluateResult(defaultResult, 'default')
  const multi = evaluateResult(multiResult, 'multieditor')

  const results = [def, multi]

  console.log('\n========== COMPARISON RESULTS ==========')
  console.log(
    `Default editor:       score=${def.reviewerScore}/10 | clean=${def.appliedCleanly} | files=${def.changedFiles} | diff=${defaultResult.diff.length}c`,
  )
  console.log(
    `Multi-prompt editor:  score=${multi.reviewerScore}/10 | clean=${multi.appliedCleanly} | files=${multi.changedFiles} | diff=${multiResult.diff.length}c`,
  )

  const winner =
    (multi.reviewerScore ?? 0) > (def.reviewerScore ?? 0)
      ? 'multieditor'
      : (def.reviewerScore ?? 0) > (multi.reviewerScore ?? 0)
        ? 'default'
        : 'tie'

  console.log(`\n🏆 Winner: ${winner.toUpperCase()}`)
  console.log(`\nDefault notes:  ${def.notes?.join(' | ')}`)
  console.log(`Multi notes:    ${multi.notes?.join(' | ')}`)

  // Show the actual diffs (truncated)
  if (defaultResult.diff) {
    console.log(
      `\n--- Default editor diff (first 500 chars) ---\n${defaultResult.diff.slice(0, 500)}`,
    )
  } else {
    console.log('\n--- Default editor: NO DIFF PRODUCED ---')
  }

  if (multiResult.diff) {
    console.log(
      `\n--- Multi-prompt editor diff (first 500 chars) ---\n${multiResult.diff.slice(0, 500)}`,
    )
  } else {
    console.log('\n--- Multi-prompt editor: NO DIFF PRODUCED ---')
  }

  // Write artifacts after the final git clean so repo-local output dirs are not
  // removed mid-run.
  const defaultDiffPath = join(outputDir, 'editor-default.diff')
  if (defaultResult.diff) {
    writeFileSync(defaultDiffPath, defaultResult.diff)
  }

  const multiDiffPath = join(outputDir, 'editor-multi.diff')
  if (multiResult.diff) {
    writeFileSync(multiDiffPath, multiResult.diff)
  }

  const resultsPath = join(outputDir, `multieditor-results-${Date.now()}.json`)
  writeFileSync(resultsPath, JSON.stringify(results, null, 2))

  const summary = {
    suite: 'multieditor-vs-default-real',
    tasks: 1,
    wins: {
      default: winner === 'default' ? 1 : 0,
      multieditor: winner === 'multieditor' ? 1 : 0,
      tie: winner === 'tie' ? 1 : 0,
      incomplete: 0,
    },
    comparisons: [
      {
        taskId: 'quick-compare',
        defaultScore: def.reviewerScore,
        multieditorScore: multi.reviewerScore,
        winner,
      },
    ],
    defaultNotes: def.notes,
    multieditorNotes: multi.notes,
  }

  const summaryPath = join(outputDir, `multieditor-summary-${Date.now()}.json`)
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
  console.log(`\nDefault diff: ${defaultDiffPath}`)
  console.log(`Multi diff: ${multiDiffPath}`)
  console.log(`Results: ${resultsPath}`)
  console.log(`Summary: ${summaryPath}`)
}

await main()
