import fs from 'fs'
import path from 'path'

import type { AgentTraceData } from './trace-analyzer'

/**
 * Per task and arm: judge score, the largest prompt any request sent, how many
 * requests crossed 100k, compactions, and an estimated Claude Haiku 5.5 bill
 * from the per-request usage (`contextLog`). The SDK credit counter reads $0
 * for Haiku, so this estimate is the cost figure to read.
 *
 * OpenRouter's list card: $0.10/M input, $0.01/M cache read, $0.125/M cache
 * write, $0.50/M output, all 5x once a prompt passes 100k. Uncached input is
 * priced as a cache write, an upper bound. Errored runs are listed but left
 * out of the means.
 */
const LONG_CONTEXT_TOKENS = 100_000
const PER_M = { cacheRead: 0.01, uncached: 0.125, output: 0.5 }

function requestCost(u: {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}): number {
  const tier = u.inputTokens > LONG_CONTEXT_TOKENS ? 5 : 1
  return (
    (tier *
      (u.cachedInputTokens * PER_M.cacheRead +
        (u.inputTokens - u.cachedInputTokens) * PER_M.uncached +
        u.outputTokens * PER_M.output)) /
    1e6
  )
}

const dirs = (process.argv[2] ?? '').split(',').filter(Boolean)
type Row = {
  task: string
  agent: string
  score: number | undefined
  error: boolean
  requests: number
  maxPrompt: number
  over100k: number
  compactions: number
  cost: number
  agentSec: number
}
const rows: Row[] = []
for (const dir of dirs) {
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json') || file.includes('ANALYSIS')) continue
    const data = JSON.parse(
      fs.readFileSync(path.join(dir, file), 'utf8'),
    ) as AgentTraceData
    if (!data.agentId || !data.judgeResult) continue
    const usage = (data.contextLog ?? []).filter((e) => e.type === 'usage')
    const task = file.slice(
      file.indexOf('-') + 1,
      file.indexOf(`-${data.agentId.replace(/[^a-zA-Z0-9-]/g, '_')}-`),
    )
    rows.push({
      task,
      agent: data.agentId,
      score: data.judgeResult.overallScore,
      error: Boolean(data.error),
      requests: usage.length,
      maxPrompt: Math.max(0, ...usage.map((u) => u.inputTokens)),
      over100k: usage.filter((u) => u.inputTokens > LONG_CONTEXT_TOKENS).length,
      compactions: (data.contextLog ?? []).filter(
        (e) => e.type === 'compaction',
      ).length,
      cost: usage.reduce((sum, u) => sum + requestCost(u), 0),
      agentSec: Math.round((data.agentDurationMs ?? data.durationMs) / 1000),
    })
  }
}

rows.sort(
  (a, b) => a.task.localeCompare(b.task) || a.agent.localeCompare(b.agent),
)
const fmtK = (n: number) => `${Math.round(n / 1000)}k`
console.log(
  [
    'task',
    'agent',
    'score',
    'err',
    'reqs',
    'maxPrompt',
    '>100k',
    'compact',
    'est$',
    'sec',
  ].join('\t'),
)
for (const r of rows)
  console.log(
    [
      r.task,
      r.agent.replace('base3-haiku-5-5-', '').replace('-evals', '') || 'base',
      r.score?.toFixed(1),
      r.error ? 'E' : '',
      r.requests,
      fmtK(r.maxPrompt),
      r.over100k,
      r.compactions,
      r.cost.toFixed(3),
      r.agentSec,
    ].join('\t'),
  )

const byAgent = new Map<string, Row[]>()
for (const r of rows) byAgent.set(r.agent, [...(byAgent.get(r.agent) ?? []), r])
console.log(
  '\nagent\tn\tscore\tmean est$\tmedian sec\trequests>100k\tmaxPrompt',
)
const mean = (xs: number[]) =>
  xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
for (const [agent, all] of byAgent) {
  const rs = all.filter((r) => !r.error)
  const secs = rs.map((r) => r.agentSec).sort((a, b) => a - b)
  console.log(
    [
      agent,
      rs.length,
      mean(rs.map((r) => r.score ?? 0)).toFixed(2),
      mean(rs.map((r) => r.cost)).toFixed(3),
      secs[Math.floor(secs.length / 2)],
      `${rs.reduce((s, r) => s + r.over100k, 0)}/${rs.reduce((s, r) => s + r.requests, 0)}`,
      fmtK(Math.max(...rs.map((r) => r.maxPrompt))),
    ].join('\t'),
  )
}
