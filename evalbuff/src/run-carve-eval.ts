/**
 * Run carve-based evals: apply a carve (delete a feature), run agents to rebuild it,
 * judge against the original code, then iterate on docs.
 *
 * Usage:
 *   bun run evalbuff/src/run-carve-eval.ts --repo /path/to/repo --carve-file carve-2026-03-30.json [--feature cli-init-command] [--parallelism 5]
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  analyzeFailure,
  applyDocEdit,
  compareScores,
  readCurrentDocs,
  revertDocEdit,
} from './docs-optimizer'
import { judgeTaskResult } from './judge'
import { ClaudeRunner } from './runners/claude'

import type { CarvedFeature, CarveResult, FileOperation } from './carve-features'
import type { JudgingResult, ReviewerAgentType } from './judge'
import type { RunnerResult } from './runners/runner'

// --- Doc read stats ---

/** Extract doc file reads from an agent trace (JSONL of PrintModeEvents). */
function extractDocReads(agentTrace: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const line of agentTrace.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type !== 'tool_call' || event.toolName !== 'Read') continue
      const filePath: string = event.input?.file_path ?? ''
      // Normalize to repo-relative path
      const match = filePath.match(/(?:^|\/)(?:docs\/.*|AGENTS\.md|CLAUDE\.md)$/)
      if (!match) continue
      const relPath = match[0].startsWith('/') ? match[0].slice(1) : match[0]
      counts[relPath] = (counts[relPath] || 0) + 1
    } catch {
      // not JSON
    }
  }
  return counts
}

/** Merge multiple doc-read count maps into one (summing counts). */
function mergeDocReads(maps: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      merged[k] = (merged[k] || 0) + v
    }
  }
  return merged
}

// --- Apply carve operations to a repo directory ---

function applyCarveOperations(repoDir: string, operations: FileOperation[]): void {
  for (const op of operations) {
    const fullPath = path.join(repoDir, op.path)
    if (op.action === 'delete') {
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath)
      }
    } else if (op.action === 'modify' && op.newContent !== undefined) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, op.newContent)
    }
  }
}

/**
 * Compute a reverse diff (what needs to be added back) from a carve.
 * This is the "ground truth" — the original code that was removed.
 */
function computeGroundTruthDiff(feature: CarvedFeature): string {
  const diffs: string[] = []

  for (const op of feature.operations) {
    if (op.action === 'delete' && feature.originalFiles[op.path]) {
      // File was deleted — ground truth is to recreate it
      const lines = feature.originalFiles[op.path].split('\n')
      diffs.push(
        `--- /dev/null\n+++ b/${op.path}\n@@ -0,0 +1,${lines.length} @@\n` +
          lines.map((l) => `+${l}`).join('\n'),
      )
    } else if (op.action === 'modify' && feature.originalFiles[op.path]) {
      // File was modified — ground truth is the original version
      const origLines = feature.originalFiles[op.path].split('\n')
      const carvedLines = (op.newContent || '').split('\n')
      diffs.push(
        `--- a/${op.path}\n+++ b/${op.path}\n@@ -1,${carvedLines.length} +1,${origLines.length} @@\n` +
          carvedLines.map((l) => `-${l}`).join('\n') +
          '\n' +
          origLines.map((l) => `+${l}`).join('\n'),
      )
    }
  }

  return diffs.join('\n\n')
}

// --- Clone repo and apply carve ---

interface TestRepoResult<T> {
  result: T
  cleanup: () => void
}

async function withCarvedRepo<T>(
  repoPath: string,
  feature: CarvedFeature,
  initCommand: string | undefined,
  fn: (repoDir: string, carveSha: string) => Promise<T>,
): Promise<T> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-eval-'))
  const repoDir = path.join(tempDir, 'repo')

  try {
    // Local clone (fast, uses hardlinks)
    execSync(`git clone --no-checkout "${repoPath}" "${repoDir}"`, {
      stdio: 'ignore',
    })
    const headSha = execSync('git rev-parse HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()
    execSync(`git checkout ${headSha}`, { cwd: repoDir, stdio: 'ignore' })

    // Apply the carve operations (delete the feature)
    applyCarveOperations(repoDir, feature.operations)

    // Commit the carved state so agents start from a clean working tree
    execSync('git add -A', { cwd: repoDir, stdio: 'ignore' })
    execSync(
      `git commit -m "carve: remove ${feature.id}" --allow-empty`,
      { cwd: repoDir, stdio: 'ignore' },
    )
    const carveSha = execSync('git rev-parse HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim()

    // Run init command if provided
    if (initCommand) {
      try {
        execSync(initCommand, { cwd: repoDir, stdio: 'ignore' })
      } catch (e) {
        console.warn(`Init command failed: ${e}`)
      }
    }

    return await fn(repoDir, carveSha)
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

// --- Run a single agent on a carved repo ---

async function runAgentOnCarve(opts: {
  idx: number
  total: number
  repoPath: string
  feature: CarvedFeature
  initCommand?: string
  model: string
  agentTimeoutMs: number
  groundTruthDiff: string
  reviewerAgents: ReviewerAgentType[]
  docsSourcePath: string
}): Promise<{
  score: number
  diff: string
  agentTrace: string
  judging: JudgingResult
  costEstimate: number
}> {
  const {
    idx,
    total,
    repoPath,
    feature,
    initCommand,
    model,
    agentTimeoutMs,
    groundTruthDiff,
    reviewerAgents,
    docsSourcePath,
  } = opts

  return withCarvedRepo(repoPath, feature, initCommand, async (repoDir, carveSha) => {
    // Copy docs into the carved repo
    copyDocsIntoRepo(docsSourcePath, repoDir)

    console.log(`  [Run ${idx + 1}/${total}] Running claude (${model}) on carved repo...`)
    const runner = new ClaudeRunner(repoDir, {}, model)

    let result: RunnerResult
    try {
      result = await runner.run(feature.prompt)
    } catch (runError) {
      const errMsg =
        runError instanceof Error ? runError.message : String(runError)
      console.warn(`  [Run ${idx + 1}/${total}] Agent failed: ${errMsg.slice(0, 200)}`)
      return {
        score: -1,
        diff: '',
        agentTrace: `Agent error: ${errMsg}`,
        judging: {
          analysis: `Agent failed: ${errMsg.slice(0, 500)}`,
          strengths: [],
          weaknesses: ['Agent failed due to infrastructure error'],
          e2eTestsPerformed: [],
          completionScore: -1,
          codeQualityScore: -1,
          e2eScore: -1,
          overallScore: -1,
        },
        costEstimate: 0,
      }
    }

    const agentTrace = result.steps
      .map((step) => JSON.stringify(step))
      .join('\n')

    console.log(`  [Run ${idx + 1}/${total}] Judging...`)
    const judging = await judgeTaskResult({
      taskPrompt: feature.prompt,
      agentDiff: result.diff,
      groundTruthDiff,
      repoDir,
      error: result.diff === '' ? 'Agent made no changes' : undefined,
      reviewerAgents,
    })

    return {
      score: judging.overallScore,
      diff: result.diff,
      agentTrace,
      judging,
      costEstimate: result.totalCostUsd,
    }
  })
}

function copyDocsIntoRepo(sourceRepoPath: string, targetRepoPath: string): void {
  const sourceDocsDir = path.join(sourceRepoPath, 'docs')
  const sourceAgentsMd = path.join(sourceRepoPath, 'AGENTS.md')
  const targetDocsDir = path.join(targetRepoPath, 'docs')
  const targetAgentsMd = path.join(targetRepoPath, 'AGENTS.md')

  let copied = false
  if (fs.existsSync(sourceDocsDir)) {
    fs.cpSync(sourceDocsDir, targetDocsDir, { recursive: true })
    copied = true
  }
  if (fs.existsSync(sourceAgentsMd)) {
    fs.cpSync(sourceAgentsMd, targetAgentsMd)
    copied = true
  }

  if (copied) {
    try {
      execSync(
        'git add docs/ AGENTS.md 2>/dev/null; git add -u docs/ AGENTS.md 2>/dev/null',
        { cwd: targetRepoPath, stdio: 'ignore' },
      )
      execSync('git commit -m "evalbuff: pre-load docs" --allow-empty', {
        cwd: targetRepoPath,
        stdio: 'ignore',
      })
    } catch {
      // fine
    }
  }
}

// --- Main carve eval loop ---

interface CarveEvalOptions {
  repoPath: string
  carveFile: string
  featureId?: string // run only this feature (default: all)
  model: string
  parallelism: number
  agentTimeoutMs: number
  reviewerAgents: ReviewerAgentType[]
  initCommand?: string
  maxImprovementIterations: number
}

interface CarveEvalResult {
  featureId: string
  prompt: string
  baselineScore: number
  finalScore: number
  docsKept: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }>
  docsRejected: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }>
  totalCost: number
  /** Which doc files agents read and how many times (summed across all parallel runs). */
  docsRead: Record<string, number>
}

async function runCarveEval(options: CarveEvalOptions): Promise<void> {
  const {
    repoPath,
    carveFile,
    featureId,
    model,
    parallelism,
    agentTimeoutMs,
    reviewerAgents,
    initCommand,
    maxImprovementIterations,
  } = options

  // Load carve data
  const carveData: CarveResult = JSON.parse(
    fs.readFileSync(carveFile, 'utf-8'),
  )

  // Select features
  let features = carveData.features
  if (featureId) {
    features = features.filter((f) => f.id === featureId)
    if (features.length === 0) {
      console.error(
        `Feature "${featureId}" not found. Available: ${carveData.features.map((f) => f.id).join(', ')}`,
      )
      process.exit(1)
    }
  }

  console.log(`\nCarve Eval:`)
  console.log(`  Repo: ${repoPath}`)
  console.log(`  Model: ${model}`)
  console.log(`  Parallelism: ${parallelism}`)
  console.log(`  Reviewers: ${reviewerAgents.join(', ')}`)
  console.log(`  Features: ${features.length}`)
  console.log(`  Max doc improvement iterations: ${maxImprovementIterations}`)

  const results: CarveEvalResult[] = []

  for (const feature of features) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Feature: ${feature.id}`)
    console.log(`Prompt: ${feature.prompt}`)
    console.log(`Operations: ${feature.operations.length} (${feature.operations.filter((o) => o.action === 'delete').length} deletes, ${feature.operations.filter((o) => o.action === 'modify').length} modifies)`)
    console.log(`${'='.repeat(60)}`)

    const groundTruthDiff = computeGroundTruthDiff(feature)

    // --- Baseline: run agents in parallel ---
    console.log(`\n  Running ${parallelism} agents in parallel (baseline)...`)
    const baselineResults = await Promise.all(
      Array.from({ length: parallelism }, (_, i) =>
        runAgentOnCarve({
          idx: i,
          total: parallelism,
          repoPath,
          feature,
          initCommand,
          model,
          agentTimeoutMs,
          groundTruthDiff,
          reviewerAgents,
          docsSourcePath: repoPath,
        }),
      ),
    )

    const validBaseline = baselineResults.filter((r) => r.score >= 0)
    let totalCost = baselineResults.reduce((a, r) => a + r.costEstimate, 0)

    if (validBaseline.length === 0) {
      console.log(`  All agents failed. Skipping feature.`)
      results.push({
        featureId: feature.id,
        prompt: feature.prompt,
        baselineScore: 0,
        finalScore: 0,
        docsKept: [],
        docsRejected: [],
        totalCost,
        docsRead: {},
      })
      continue
    }

    const baselineScores = validBaseline.map((r) => r.score)
    let currentScore =
      baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length
    console.log(
      `  Baseline: ${currentScore.toFixed(1)}/10 (${baselineScores.map((s) => s.toFixed(1)).join(', ')})`,
    )

    // Track which docs agents read across all runs for this feature
    const baselineDocReads = mergeDocReads(validBaseline.map((r) => extractDocReads(r.agentTrace)))
    const docReadEntries = Object.entries(baselineDocReads).sort((a, b) => b[1] - a[1])
    if (docReadEntries.length > 0) {
      console.log(`  Docs read (baseline): ${docReadEntries.map(([p, n]) => `${p} (${n}x)`).join(', ')}`)
    } else {
      console.log(`  Docs read (baseline): none`)
    }

    const docsKept: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }> = []
    const docsRejected: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }> = []

    // --- Doc improvement loop ---
    if (currentScore < 9.0) {
      let latestJudgings = validBaseline.map((r) => r.judging)
      let latestDiffs = validBaseline.map((r) => r.diff)
      let latestTraces = validBaseline.map((r) => r.agentTrace)

      for (let iter = 0; iter < maxImprovementIterations; iter++) {
        // Pick worst run for analysis
        const worstIdx = latestJudgings.reduce(
          (minIdx, j, idx, arr) =>
            j.overallScore < arr[minIdx].overallScore ? idx : minIdx,
          0,
        )

        const currentDocs = readCurrentDocs(repoPath)
        const editHistory = [
          ...docsKept.map((d) => ({ ...d, outcome: 'accepted' as const })),
          ...docsRejected.map((d) => ({ ...d, outcome: 'rejected' as const })),
        ]

        console.log(`  Analyzing for doc improvements (iteration ${iter + 1})...`)
        const docSuggestion = await analyzeFailure({
          judgeResult: latestJudgings[worstIdx],
          taskPrompt: feature.prompt,
          agentDiff: latestDiffs[worstIdx],
          agentTrace: latestTraces[worstIdx],
          groundTruthDiff,
          currentDocs,
          editHistory,
        })

        if (!docSuggestion) {
          console.log(`  No doc suggestion — stopping.`)
          break
        }

        console.log(`  Doc suggestion: ${docSuggestion.suggestedDocPath}`)
        console.log(`    Reasoning: ${docSuggestion.reasoning}`)

        // Save previous content for revert
        const docFullPath = path.join(repoPath, 'docs', docSuggestion.suggestedDocPath)
        const previousContent = fs.existsSync(docFullPath)
          ? fs.readFileSync(docFullPath, 'utf-8')
          : null

        applyDocEdit(repoPath, docSuggestion.suggestedDocPath, docSuggestion.suggestedContent)

        // Re-run with new docs
        console.log(`  Re-running ${parallelism} agents with new docs...`)
        const rerunResults = await Promise.all(
          Array.from({ length: parallelism }, (_, i) =>
            runAgentOnCarve({
              idx: i,
              total: parallelism,
              repoPath,
              feature,
              initCommand,
              model,
              agentTimeoutMs,
              groundTruthDiff,
              reviewerAgents,
              docsSourcePath: repoPath,
            }),
          ),
        )

        const validRerun = rerunResults.filter((r) => r.score >= 0)
        totalCost += rerunResults.reduce((a, r) => a + r.costEstimate, 0)

        if (validRerun.length === 0) {
          console.log(`  Re-run failed. Reverting doc.`)
          if (previousContent !== null) {
            applyDocEdit(repoPath, docSuggestion.suggestedDocPath, previousContent)
          } else {
            revertDocEdit(repoPath, docSuggestion.suggestedDocPath)
          }
          break
        }

        const rerunScores = validRerun.map((r) => r.score)
        const rerunAvg =
          rerunScores.reduce((a, b) => a + b, 0) / rerunScores.length
        const comparison = compareScores(currentScore, rerunAvg)
        console.log(
          `  New score: ${rerunAvg.toFixed(1)}/10 (${comparison}) (${rerunScores.map((s) => s.toFixed(1)).join(', ')})`,
        )

        if (comparison === 'improved' || comparison === 'same') {
          const reason = comparison === 'improved' ? 'improved' : 'within noise, keeping'
          console.log(`  Keeping doc: ${docSuggestion.suggestedDocPath} (${reason})`)
          docsKept.push({
            path: docSuggestion.suggestedDocPath,
            reasoning: docSuggestion.reasoning,
            scoreBefore: currentScore,
            scoreAfter: rerunAvg,
          })

          // Commit the doc
          try {
            execSync('git add docs/ AGENTS.md', { cwd: repoPath, stdio: 'ignore' })
            execSync(
              `git commit -m "evalbuff: add ${docSuggestion.suggestedDocPath} (carve: ${feature.id})"`,
              { cwd: repoPath, stdio: 'ignore' },
            )
          } catch {
            console.warn('Failed to commit doc change')
          }

          currentScore = rerunAvg
          latestJudgings = validRerun.map((r) => r.judging)
          latestDiffs = validRerun.map((r) => r.diff)
          latestTraces = validRerun.map((r) => r.agentTrace)
        } else {
          console.log(`  Rejecting doc: ${docSuggestion.suggestedDocPath}`)
          docsRejected.push({
            path: docSuggestion.suggestedDocPath,
            reasoning: docSuggestion.reasoning,
            scoreBefore: currentScore,
            scoreAfter: rerunAvg,
          })

          if (previousContent !== null) {
            applyDocEdit(repoPath, docSuggestion.suggestedDocPath, previousContent)
          } else {
            revertDocEdit(repoPath, docSuggestion.suggestedDocPath)
          }
          break
        }
      }
    }

    results.push({
      featureId: feature.id,
      prompt: feature.prompt,
      baselineScore: baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length,
      finalScore: currentScore,
      docsKept,
      docsRejected,
      totalCost,
      docsRead: baselineDocReads,
    })
  }

  // --- Summary ---
  console.log(`\n${'='.repeat(60)}`)
  console.log('CARVE EVAL RESULTS')
  console.log(`${'='.repeat(60)}`)

  let totalCostAll = 0
  for (const r of results) {
    console.log(`\n  ${r.featureId}:`)
    console.log(`    Prompt: ${r.prompt.slice(0, 80)}...`)
    console.log(`    Baseline: ${r.baselineScore.toFixed(1)}/10`)
    console.log(`    Final:    ${r.finalScore.toFixed(1)}/10`)
    console.log(`    Docs kept: ${r.docsKept.length}, rejected: ${r.docsRejected.length}`)
    const readEntries = Object.entries(r.docsRead).sort((a, b) => b[1] - a[1])
    if (readEntries.length > 0) {
      console.log(`    Docs read: ${readEntries.map(([p, n]) => `${p} (${n}x)`).join(', ')}`)
    } else {
      console.log(`    Docs read: none`)
    }
    console.log(`    Cost: $${r.totalCost.toFixed(2)}`)
    totalCostAll += r.totalCost
  }

  const avgBaseline =
    results.reduce((a, r) => a + r.baselineScore, 0) / results.length
  const avgFinal =
    results.reduce((a, r) => a + r.finalScore, 0) / results.length

  console.log(`\n  Average baseline: ${avgBaseline.toFixed(1)}/10`)
  console.log(`  Average final:    ${avgFinal.toFixed(1)}/10`)
  console.log(`  Total cost: $${totalCostAll.toFixed(2)}`)

  // Aggregate doc read stats across all features
  const allDocReads = mergeDocReads(results.map((r) => r.docsRead))
  const allReadEntries = Object.entries(allDocReads).sort((a, b) => b[1] - a[1])
  if (allReadEntries.length > 0) {
    console.log(`\n  Doc read stats (all features):`)
    for (const [docPath, count] of allReadEntries) {
      console.log(`    ${docPath}: ${count} reads`)
    }
  } else {
    console.log(`\n  No docs were read by any agent.`)
  }

  // Save results
  const outputPath = path.join(
    repoPath,
    `carve-eval-results-${new Date().toISOString().slice(0, 10)}.json`,
  )
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nResults saved to: ${outputPath}`)
}

// --- CLI ---

if (import.meta.main) {
  const args = process.argv.slice(2)

  const getArg = (name: string, defaultValue?: string): string => {
    const idx = args.indexOf(`--${name}`)
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Missing required argument: --${name}`)
  }
  const hasArg = (name: string): boolean => args.includes(`--${name}`)

  const repoPath = getArg('repo')
  const carveFile = getArg('carve-file')
  const featureId = hasArg('feature') ? getArg('feature') : undefined
  const model = getArg('model', 'sonnet')
  const parallelism = parseInt(getArg('parallelism', '3'))
  const agentTimeoutMs = parseInt(getArg('agent-timeout', '300000'))
  const reviewerAgentsArg = hasArg('reviewers') ? getArg('reviewers') : undefined
  const reviewerAgents: ReviewerAgentType[] = reviewerAgentsArg
    ? (reviewerAgentsArg.split(',') as ReviewerAgentType[])
    : ['claude', 'codex']
  const initCommand = hasArg('init-command') ? getArg('init-command') : undefined
  const maxImprovementIterations = parseInt(getArg('max-iterations', '3'))

  runCarveEval({
    repoPath,
    carveFile,
    featureId,
    model,
    parallelism,
    agentTimeoutMs,
    reviewerAgents,
    initCommand,
    maxImprovementIterations,
  }).catch((error) => {
    console.error('Carve eval failed:', error)
    process.exit(1)
  })
}
