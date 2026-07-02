/**
 * Plan-mode parallel-sharding eval — live runner.
 *
 * Runs the `base2-plan` agent on an audit-style prompt in local/BYOK mode,
 * captures the full `PrintModeEvent` trace, and feeds it through
 * `computePlanShardingSignals` + `evaluateShardingVerdict` to assert that the
 * scope-then-shard guidance added to `buildPlanOnlyInstructionsPrompt` causes
 * the agent to shard parallel subagents rather than do a single surface-level
 * codesearch.
 *
 * This is a behavioral eval (no diff scoring): it only inspects the tool-call
 * / subagent trace. It does not modify source files (plan mode is plan-only),
 * so no git clean/checkout is needed.
 *
 * Usage:
 *   bun run buffbench/run-plan-sharding-eval.ts [prompt]
 *
 * Artifacts are written to PLAN_SHARDING_OUTPUT_DIR, or
 * debug/plan-sharding-eval by default.
 */

import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { OpenbuffClient, loadLocalAgents } from '@openbuff/sdk'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import { logger } from '../logger'
import {
  buildCoverageMatrix,
  buildPlannerOutputCoverage,
  classifyBreadth,
  computePlanShardingSignals,
  evaluatePlannerOutputCoverage,
  evaluateShardingVerdict,
  evaluateSubsystemEnumeration,
} from './plan-sharding-signals'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_PROMPT =
  'Audit the whole codebase for feature improvements across agents, sdk, cli, common, evals, docs, and packages. Survey the major subsystems and surface concrete opportunities.'

async function main() {
  const cwd = resolve('.')
  const prompt = process.argv[2] ?? DEFAULT_PROMPT

  const outputDir = resolve(
    process.env.PLAN_SHARDING_OUTPUT_DIR ??
      join(cwd, 'debug/plan-sharding-eval'),
  )
  mkdirSync(outputDir, { recursive: true })

  console.log('=== Plan-mode parallel-sharding eval ===')
  console.log(`CWD: ${cwd}`)
  console.log(`Prompt: "${prompt}"`)
  console.log(`Output dir: ${outputDir}`)

  // BYOK/local mode — uses openbuff.json for provider routing.
  const client = new OpenbuffClient({ logger, cwd })

  // Load local agent definitions so `base2-plan` resolves to the working tree.
  const agentsPath = resolve(__dirname, '../../agents')
  const loadedAgents = await loadLocalAgents({ agentsPath })
  const localAgentDefinitions = Object.values(loadedAgents)
  console.log(`Loaded ${localAgentDefinitions.length} agent definitions`)

  const events: PrintModeEvent[] = []
  const startTime = Date.now()
  let cost = 0
  let runError: string | undefined

  try {
    // Plan mode can still take many steps when sharding 8-12 subagents; give
    // it a generous ceiling. The eval only cares about the shape of the
    // trace, not how long it takes.
    const maxAgentSteps = 60
    const result = await client.run({
      agent: 'base2-plan',
      prompt,
      agentDefinitions: localAgentDefinitions,
      cwd,
      maxAgentSteps,
      handleEvent: (event) => {
        events.push(event as PrintModeEvent)
        if (event.type === 'error') {
          console.error('[plan-sharding] Error event:', event.message)
        }
      },
    })

    if (result.output.type === 'error') {
      runError = String(result.output.message)
    }
    cost = (result.sessionState?.mainAgentState?.creditsUsed ?? 0) / 100
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e)
    console.error('[plan-sharding] Exception:', runError)
  }

  const durationMs = Date.now() - startTime

  const signals = computePlanShardingSignals({ events, prompt })
  // Pass `prompt` so the M10.2 minimum-shard gate (layered inside
  // evaluateShardingVerdict) fires for broad-audit prompts in the live eval.
  const baseEvaluation = evaluateShardingVerdict(signals, prompt)

  // M10.3 coverage matrix + M10.4 subsystem-enumeration guard: diagnostic
  // visibility into which enumerated domains got a shard and which top-level
  // repo dirs were audited vs. left unenumerated. Planner-output coverage is
  // a hard gate: prompt-token presence alone does not prove the planner
  // synthesized coverage for the domains it was asked to audit.
  const breadth = classifyBreadth(prompt)
  const evaluation = evaluatePlannerOutputCoverage({
    evaluation: baseEvaluation,
    breadth,
    events,
  })
  const plannerOutputCoverage = buildPlannerOutputCoverage({ breadth, events })
  const coverageMatrix = buildCoverageMatrix({ breadth, signals })
  const topLevelDirs = readdirSync(cwd, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort()
  const subsystemEnumeration = evaluateSubsystemEnumeration({
    breadth,
    topLevelDirs,
  })

  console.log('\n========== PLAN-SHARDING EVAL RESULTS ==========')
  console.log(`Verdict: ${evaluation.verdict.toUpperCase()}`)
  console.log(`Prompt kind: ${signals.promptKind}`)
  console.log(
    `spawn_agents calls: ${signals.spawnAgentsCallCount} | total agents: ${signals.totalRequestedAgents} | max batch: ${signals.maxBatchSize}`,
  )
  console.log(
    `subagent starts: ${signals.subagentStarts.length} | peak concurrency: ${signals.peakConcurrency} | sharded parallely: ${signals.shardedParallely}`,
  )
  console.log(
    `top-level direct tools: ${signals.topLevelDirectToolCount} | single-codesearch-only: ${signals.singleCodesearchOnly}`,
  )
  console.log(`distinct agent types: ${signals.distinctAgentTypes.join(', ') || '(none)'}`)
  console.log(`credits: ${cost.toFixed(1)} | duration: ${(durationMs / 1000).toFixed(1)}s | events: ${events.length}`)
  console.log('\nReasons:')
  for (const reason of evaluation.reasons) {
    console.log(`  - ${reason}`)
  }

  // M10.3 coverage matrix summary.
  if (coverageMatrix.entries.length > 0) {
    console.log('\nCoverage matrix:')
    for (const entry of coverageMatrix.entries) {
      const status = entry.covered ? 'covered' : 'uncovered'
      console.log(
        '  - ' + entry.domain + ': ' + entry.assignedPairs + ' pair(s) [' + status + ']',
      )
    }
    if (!coverageMatrix.allCovered) {
      console.log(
        '  Uncovered domains: ' + coverageMatrix.uncoveredDomains.join(', '),
      )
    }
  }

  // M10.3 planner-output coverage summary.
  if (plannerOutputCoverage.entries.length > 0) {
    console.log('\nPlanner-output coverage:')
    for (const entry of plannerOutputCoverage.entries) {
      console.log(
        '  - ' + entry.domain + ': ' + (entry.covered ? 'covered' : 'missing'),
      )
    }
    if (!plannerOutputCoverage.allCovered) {
      console.log(
        '  Missing domains: ' + plannerOutputCoverage.uncoveredDomains.join(', '),
      )
    }
  }

  // M10.4 subsystem-enumeration summary.
  console.log(
    'Subsystem enumeration: ' +
      subsystemEnumeration.auditedDirs.length +
      '/' +
      subsystemEnumeration.topLevelDirs.length +
      ' top-level dirs audited; unenumerated: ' +
      (subsystemEnumeration.unenumeratedDirs.join(', ') || '(none)'),
  )
  if (runError) {
    console.log(`\nRun error: ${runError}`)
  }

  // Write artifacts
  const tracePath = join(outputDir, `trace-${Date.now()}.json`)
  writeFileSync(tracePath, JSON.stringify(events, null, 2))

  const summaryPath = join(outputDir, `summary-${Date.now()}.json`)
  const summary = {
    suite: 'plan-sharding-eval',
    prompt,
    promptKind: signals.promptKind,
    verdict: evaluation.verdict,
    reasons: evaluation.reasons,
    signals: {
      spawnAgentsCallCount: signals.spawnAgentsCallCount,
      totalRequestedAgents: signals.totalRequestedAgents,
      maxBatchSize: signals.maxBatchSize,
      distinctAgentTypes: signals.distinctAgentTypes,
      subagentStartCount: signals.subagentStarts.length,
      peakConcurrency: signals.peakConcurrency,
      shardedParallely: signals.shardedParallely,
      singleCodesearchOnly: signals.singleCodesearchOnly,
      topLevelDirectToolCount: signals.topLevelDirectToolCount,
      // M10.2 minimum-shard diagnostic counts.
      filePickerCount: signals.filePickerCount,
      codeSearcherCount: signals.codeSearcherCount,
    },
    // M10.3 coverage matrix (SPEC R10.3): per-domain shard assignment.
    coverageMatrix: {
      entries: coverageMatrix.entries,
      uncoveredDomains: coverageMatrix.uncoveredDomains,
    },
    // M10.3 planner-output coverage: domains must appear in planner output,
    // not merely in the input prompt.
    plannerOutputCoverage: {
      entries: plannerOutputCoverage.entries,
      uncoveredDomains: plannerOutputCoverage.uncoveredDomains,
    },
    // M10.4 subsystem-enumeration guard (SPEC R10.4): audit/scope disposition.
    subsystemEnumeration: {
      topLevelDirs: subsystemEnumeration.topLevelDirs,
      auditedDirs: subsystemEnumeration.auditedDirs,
      unenumeratedDirs: subsystemEnumeration.unenumeratedDirs,
      satisfies: subsystemEnumeration.satisfies,
    },
    cost,
    durationMs,
    eventCount: events.length,
    runError,
  }
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

  console.log(`\nTrace:   ${tracePath}`)
  console.log(`Summary: ${summaryPath}`)

  // Exit non-zero on fail so CI / shells can detect a regression.
  if (evaluation.verdict === 'fail') {
    process.exitCode = 1
  }
}

await main()