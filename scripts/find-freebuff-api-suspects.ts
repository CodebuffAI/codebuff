/**
 * Find accounts whose recent Freebuff usage looks like an OpenAI-compatible
 * proxy over the free chat-completions API.
 *
 * Read-only. Intended production usage:
 *   infisical run --env=prod --silent -- bun scripts/find-freebuff-api-suspects.ts
 *
 * Useful options:
 *   --hours 168          Lookback window. Default: 168 (7 days).
 *   --limit 100          Max users to print. Default: 100.
 *   --min-score 50       Minimum suspicion score to print. Default: 50.
 *   --all-free-agents    Include all free-mode agents, not just root agents.
 *   --json               Emit JSON instead of tables.
 *
 * The scan + scoring live in `@codebuff/internal/freebuff-abuse`
 * (`identifyApiAbuseSuspects`), shared with the freebuff.com /abuse dashboard
 * and the bot-sweep endpoint. This script is a thin CLI over that function so
 * the heuristics only ever live in one place.
 */

import { identifyApiAbuseSuspects } from '@codebuff/internal/freebuff-abuse'

import type { ApiAbuseSuspect } from '@codebuff/internal/freebuff-abuse'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type Args = {
  hours: number
  limit: number
  minScore: number
  allFreeAgents: boolean
  json: boolean
  includeBanned: boolean
}

// Keep stdout clean for `--json`; the scan's single info log goes nowhere,
// warnings/errors surface on stderr.
const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (data: unknown, msg?: string) => console.error(msg ?? '', data),
  error: (data: unknown, msg?: string) => console.error(msg ?? '', data),
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return value
}

function parseNonNegativeInt(raw: string | undefined, flag: string): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return value
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Find likely Freebuff API/proxy abuse accounts.

Usage:
  bun scripts/find-freebuff-api-suspects.ts [options]

Options:
  --hours n             Lookback window in hours. Default: 168.
  --limit n             Max suspect rows to print. Default: 100.
  --min-score n         Minimum score to print. Default: 50.
  --all-free-agents     Include every free-mode agent ID instead of only roots.
  --include-banned      Show users who are already banned (default: hidden).
  --json                Emit JSON.
`)
    process.exit(0)
  }

  const hoursIdx = argv.indexOf('--hours')
  const limitIdx = argv.indexOf('--limit')
  const minScoreIdx = argv.indexOf('--min-score')

  return {
    hours: hoursIdx >= 0 ? parsePositiveInt(argv[hoursIdx + 1], '--hours') : 168,
    limit: limitIdx >= 0 ? parsePositiveInt(argv[limitIdx + 1], '--limit') : 100,
    minScore:
      minScoreIdx >= 0
        ? parseNonNegativeInt(argv[minScoreIdx + 1], '--min-score')
        : 50,
    allFreeAgents: argv.includes('--all-free-agents'),
    json: argv.includes('--json'),
    includeBanned: argv.includes('--include-banned'),
  }
}

function fmt(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function printTable(suspects: ApiAbuseSuspect[], args: Args, cutoff: Date) {
  console.log(
    `Freebuff API suspect scan since ${cutoff.toISOString()} (${args.hours}h)`,
  )
  console.log(
    `agents=${args.allFreeAgents ? 'all free-mode agents' : 'freebuff root agents only'} minScore=${args.minScore} limit=${args.limit}`,
  )
  console.log('')

  if (suspects.length === 0) {
    console.log('No accounts met the score threshold.')
    return
  }

  console.log(
    [
      'score'.padStart(5),
      'email'.padEnd(34),
      'msgs'.padStart(6),
      'runs'.padStart(5),
      'clients'.padStart(7),
      'maxC/run'.padStart(8),
      'maxM/run'.padStart(8),
      'missStep%'.padStart(9),
      'maxDur'.padStart(7),
      'flags',
    ].join('  '),
  )
  console.log('-'.repeat(150))

  for (const suspect of suspects) {
    const email = (suspect.email ?? suspect.userId).slice(0, 34)
    const maxDur =
      suspect.maxRunDurationMinutes === null
        ? '-'
        : `${Math.round(suspect.maxRunDurationMinutes)}m`
    console.log(
      [
        String(suspect.score).padStart(5),
        email.padEnd(34),
        fmt(suspect.messageCount).padStart(6),
        fmt(suspect.runCount).padStart(5),
        fmt(suspect.clientIdCount).padStart(7),
        fmt(suspect.maxClientIdsPerRun).padStart(8),
        fmt(suspect.maxMessagesPerRun).padStart(8),
        `${Math.round(suspect.missingStepRatio * 100)}%`.padStart(9),
        maxDur.padStart(7),
        suspect.flags.join(', '),
      ].join('  '),
    )
  }

  console.log('')
  for (const suspect of suspects.slice(0, 20)) {
    console.log(
      `${suspect.email ?? suspect.userId} score=${suspect.score} user=${suspect.userId}`,
    )
    console.log(
      `  messages=${suspect.messageCount} runs=${suspect.runCount} clients=${suspect.clientIdCount} agents=${suspect.agents.join(', ')}`,
    )
    console.log(
      `  models=${suspect.models.slice(0, 6).join(', ')}${suspect.models.length > 6 ? ', ...' : ''}`,
    )
    for (const run of suspect.sampleRuns.slice(0, 3)) {
      const duration =
        run.durationMinutes === null
          ? '-'
          : `${Math.round(run.durationMinutes)}m`
      console.log(
        `  run ${run.runId}: msgs=${run.messages} clients=${run.clientIds} steps=${run.steps}/${run.totalSteps ?? '-'} status=${run.status ?? '-'} duration=${duration}`,
      )
    }
  }
}

async function main() {
  const args = parseArgs()
  const report = await identifyApiAbuseSuspects({
    logger,
    hours: args.hours,
    minScore: args.minScore,
    limit: args.limit,
    includeBanned: args.includeBanned,
    allFreeAgents: args.allFreeAgents,
  })
  const cutoff = new Date(report.generatedAt.getTime() - args.hours * 3600_000)

  if (args.json) {
    console.log(
      JSON.stringify(
        { cutoff: cutoff.toISOString(), suspects: report.suspects },
        null,
        2,
      ),
    )
    return
  }

  printTable(report.suspects, args, cutoff)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
