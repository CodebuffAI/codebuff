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

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CodebuffClient, loadLocalAgents } from '@codebuff/sdk'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import { logger } from '../logger'
import {
  computePlanShardingSignals,
  evaluateShardingVerdict,
} from './plan-sharding-signals'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_PROMPT =
  'Audit this codebase for any feature improvements that can be made. Survey the major subsystems and surface concrete opportunities.'

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
  const client = new CodebuffClient({ logger, cwd })

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
  const evaluation = evaluateShardingVerdict(signals)

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