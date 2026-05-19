/**
 * Export reconstructed multi-turn DeepSeek V4 free-mode sessions from BigQuery.
 *
 * BigQuery's `message` table stores one row per provider call. Older rows kept
 * the full request, so the latest/highest-context request in a client session
 * contains the conversation so far: system prompt, user messages, assistant
 * tool calls, and tool results. This script groups those rows by
 * `request.codebuff_metadata.client_id` and emits final session-level traces.
 *
 * Usage:
 *   bun scripts/export-deepseek-session-traces.ts --prod
 *   bun scripts/export-deepseek-session-traces.ts --prod --sessions-per-agent 2
 *   infisical run --env=prod --silent -- bun scripts/export-deepseek-session-traces.ts --prod
 */

import { BigQuery } from '@google-cloud/bigquery'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

type Target = {
  agentId: string
  modelIds: string[]
}

type Args = {
  dataset: string
  sessionsPerAgent: number
  totalSessions: number | null
  sampleMode: 'newest' | 'random' | 'even'
  lookbackDays: number
  beforeDays: number
  startDate: string | null
  endDate: string | null
  outPath: string
  traceDir: string | null
  skipAggregate: boolean
  minMessages: number
  clientId: string | null
}

type CandidateRow = {
  client_id: string
  target_agent_id: string
  model: string
  representative_message_id: string
  max_message_count: number
  provider_call_count: number
  first_finished_at: unknown
  last_finished_at: unknown
}

type SessionRow = {
  id: string
  finished_at: unknown
  run_id: string | null
  message_count: number | null
  request_json: unknown
  response: string | null
  reasoning_text: string | null
}

type ChatMessage = Record<string, unknown> & {
  role?: string
  content?: unknown
}

const TARGETS: Target[] = [
  {
    agentId: 'base2-free-deepseek',
    modelIds: ['deepseek/deepseek-v4-pro', 'deepseek-v4-pro'],
  },
  {
    agentId: 'base2-free-deepseek-flash',
    modelIds: ['deepseek/deepseek-v4-flash', 'deepseek-v4-flash'],
  },
]

const OUTPUT_DATASET_NAME = 'freebuff_data'

function printHelp() {
  console.log(`Export reconstructed multi-turn DeepSeek V4 free-mode sessions.

Usage:
  bun scripts/export-deepseek-session-traces.ts [options]

Options:
  --prod                  Use codebuff_data instead of codebuff_data_dev.
  --sessions-per-agent n  Sessions to export per target agent. Default: 1.
  --total-sessions n      Export n sessions total across DeepSeek Pro and Flash, newest first.
  --sample-mode mode      With --total-sessions: newest, random, or even. Default: newest.
  --lookback-days n       Days to scan before the before-days cutoff. Default: 60.
  --before-days n         Exclude rows newer than this many days. Default: 3.
  --start-date date       Inclusive UTC date/time lower bound, e.g. 2026-05-12.
  --end-date date         Exclusive UTC date/time upper bound, e.g. 2026-05-16.
  --min-messages n        Minimum messages in representative request. Default: 10.
  --client-id id          Export one known client session id.
  --out path              Output JSON path. Default: .context/deepseek-session-traces.json.
  --trace-dir path        Directory for separate trace files. Default: <out-dir>/deepseek-session-traces.
  --skip-aggregate        Only write separate trace files, not the combined JSON.
  --help                  Show this message.
`)
}

function readNumberFlag(
  argv: string[],
  name: string,
  fallback: number,
): number {
  const idx = argv.indexOf(name)
  if (idx < 0) return fallback

  const raw = argv[idx + 1]
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function readStringFlag(
  argv: string[],
  name: string,
  fallback: string | null,
): string | null {
  const idx = argv.indexOf(name)
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1]! : fallback
}

function readSampleMode(argv: string[]): Args['sampleMode'] {
  const mode = readStringFlag(argv, '--sample-mode', 'newest')
  if (mode === 'newest' || mode === 'random' || mode === 'even') {
    return mode
  }
  throw new Error('--sample-mode must be one of: newest, random, even')
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  return {
    dataset: argv.includes('--prod') ? 'codebuff_data' : 'codebuff_data_dev',
    sessionsPerAgent: readNumberFlag(argv, '--sessions-per-agent', 1),
    totalSessions: argv.includes('--total-sessions')
      ? readNumberFlag(argv, '--total-sessions', 1)
      : null,
    sampleMode: readSampleMode(argv),
    lookbackDays: readNumberFlag(argv, '--lookback-days', 60),
    beforeDays: readNumberFlag(argv, '--before-days', 3),
    startDate: readStringFlag(argv, '--start-date', null),
    endDate: readStringFlag(argv, '--end-date', null),
    outPath:
      readStringFlag(argv, '--out', null) ??
      '.context/deepseek-session-traces.json',
    traceDir: readStringFlag(argv, '--trace-dir', null),
    skipAggregate: argv.includes('--skip-aggregate'),
    minMessages: readNumberFlag(argv, '--min-messages', 10),
    clientId: readStringFlag(argv, '--client-id', null),
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value)
  }
  return String(value)
}

function getRequest(row: SessionRow): Record<string, unknown> {
  if (typeof row.request_json === 'string') {
    return JSON.parse(row.request_json) as Record<string, unknown>
  }
  if (
    row.request_json &&
    typeof row.request_json === 'object' &&
    !Array.isArray(row.request_json)
  ) {
    return row.request_json as Record<string, unknown>
  }
  return {}
}

function getMessages(request: Record<string, unknown>): ChatMessage[] {
  return Array.isArray(request.messages)
    ? request.messages.filter(
        (message): message is ChatMessage =>
          !!message && typeof message === 'object' && !Array.isArray(message),
      )
    : []
}

function getTools(request: Record<string, unknown>): unknown[] {
  return Array.isArray(request.tools) ? request.tools : []
}

function shortPreview(value: unknown, maxChars = 180): string {
  const text =
    typeof value === 'string' ? value : (JSON.stringify(value, null, 0) ?? '')
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function hasSameAssistantText(messages: ChatMessage[], response: string) {
  const last = messages.at(-1)
  return (
    last?.role === 'assistant' &&
    typeof last.content === 'string' &&
    last.content.trim() === response.trim()
  )
}

function buildFinalMessages(row: SessionRow): ChatMessage[] {
  const request = getRequest(row)
  const messages = [...getMessages(request)]
  const response = row.response?.trim()

  if (response && !hasSameAssistantText(messages, response)) {
    messages.push({
      role: 'assistant',
      content: row.response,
      ...(row.reasoning_text ? { reasoning_content: row.reasoning_text } : {}),
      source_message_id: row.id,
    })
  }

  return messages
}

async function fetchCandidateSessions(args: Args): Promise<CandidateRow[]> {
  const targetStructs = TARGETS.flatMap((target) =>
    target.modelIds.map((modelId) => ({
      agent_id: target.agentId,
      model_id: modelId,
    })),
  )

  const datePredicate =
    args.startDate || args.endDate
      ? `
        ${args.startDate ? 'AND m.finished_at >= TIMESTAMP(@startDate)' : ''}
        ${args.endDate ? 'AND m.finished_at < TIMESTAMP(@endDate)' : ''}
      `
      : `
        AND m.finished_at >= TIMESTAMP_SUB(
          TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @beforeDays DAY),
          INTERVAL @lookbackDays DAY
        )
        AND m.finished_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @beforeDays DAY)
      `

  const isEvenTotalSample = args.totalSessions && args.sampleMode === 'even'
  const samplingCtes = isEvenTotalSample
    ? `
    ranked_by_time AS (
      SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY last_finished_at DESC, max_message_count DESC) AS time_rank,
        COUNT(*) OVER () AS total_count
      FROM session_summary
    ),
    bucketed AS (
      SELECT
        *,
        CAST(FLOOR((time_rank - 1) * @sessionLimit / total_count) AS INT64) AS sample_bucket
      FROM ranked_by_time
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY sample_bucket
          ORDER BY RAND()
        ) AS target_rank
      FROM bucketed
    )
      `
    : `
    ranked AS (
      SELECT
        *,
        ${
          args.totalSessions
            ? `ROW_NUMBER() OVER (
              ORDER BY ${
                args.sampleMode === 'random'
                  ? 'RAND()'
                  : 'last_finished_at DESC, max_message_count DESC'
              }
            ) AS target_rank`
            : `ROW_NUMBER() OVER (
              PARTITION BY target_agent_id
              ORDER BY provider_call_count DESC, max_message_count DESC, last_finished_at DESC
            ) AS target_rank`
        }
      FROM session_summary
    )
      `

  const selectExcept = isEvenTotalSample
    ? 'target_rank, time_rank, total_count, sample_bucket'
    : 'target_rank'

  const targetRankPredicate = isEvenTotalSample
    ? 'target_rank = 1'
    : 'target_rank <= @sessionLimit'

  const query = `
    WITH targets AS (
      SELECT *
      FROM UNNEST(@targets)
    ),
    rows_with_full_messages AS (
      SELECT
        JSON_VALUE(m.request, '$.codebuff_metadata.client_id') AS client_id,
        t.agent_id AS target_agent_id,
        JSON_VALUE(m.request, '$.model') AS model,
        m.id,
        m.finished_at,
        LENGTH(TRIM(COALESCE(m.response, ''))) > 0 AS has_response,
        ARRAY_LENGTH(JSON_QUERY_ARRAY(m.request, '$.messages')) AS message_count
      FROM \`${args.dataset}.message\` AS m
      JOIN targets AS t
        ON JSON_VALUE(m.request, '$.model') = t.model_id
      WHERE TRUE
        ${datePredicate}
        AND JSON_VALUE(m.request, '$.codebuff_metadata.cost_mode') = 'free'
        AND JSON_VALUE(m.request, '$.codebuff_metadata.client_id') IS NOT NULL
        AND JSON_QUERY_ARRAY(m.request, '$.messages') IS NOT NULL
        AND COALESCE(JSON_VALUE(m.request, '$.messages_omitted'), 'false') != 'true'
        ${args.clientId ? "AND JSON_VALUE(m.request, '$.codebuff_metadata.client_id') = @clientId" : ''}
    ),
    session_summary AS (
      SELECT
        client_id,
        target_agent_id,
        ANY_VALUE(model HAVING MAX message_count) AS model,
        ARRAY_AGG(id ORDER BY has_response DESC, message_count DESC, finished_at DESC LIMIT 1)[OFFSET(0)] AS representative_message_id,
        MAX(message_count) AS max_message_count,
        COUNT(*) AS provider_call_count,
        MIN(finished_at) AS first_finished_at,
        MAX(finished_at) AS last_finished_at
      FROM rows_with_full_messages
      GROUP BY client_id, target_agent_id
      HAVING max_message_count >= @minMessages
    ),
    ${samplingCtes}
    SELECT * EXCEPT(${selectExcept})
    FROM ranked
    WHERE ${targetRankPredicate}
    ORDER BY last_finished_at DESC, max_message_count DESC
  `

  const [rows] = await new BigQuery().query({
    query,
    params: {
      targets: targetStructs,
      beforeDays: args.beforeDays,
      lookbackDays: args.lookbackDays,
      minMessages: args.minMessages,
      sessionLimit: args.totalSessions ?? args.sessionsPerAgent,
      ...(args.startDate ? { startDate: args.startDate } : {}),
      ...(args.endDate ? { endDate: args.endDate } : {}),
      ...(args.clientId ? { clientId: args.clientId } : {}),
    },
  })

  return rows as CandidateRow[]
}

async function fetchRepresentativeRows(args: Args, messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, SessionRow>()

  const query = `
    SELECT
      id,
      finished_at,
      JSON_VALUE(request, '$.codebuff_metadata.run_id') AS run_id,
      ARRAY_LENGTH(JSON_QUERY_ARRAY(request, '$.messages')) AS message_count,
      request AS request_json,
      response,
      reasoning_text
    FROM \`${args.dataset}.message\`
    WHERE id IN UNNEST(@messageIds)
      AND JSON_VALUE(request, '$.codebuff_metadata.cost_mode') = 'free'
      AND JSON_QUERY_ARRAY(request, '$.messages') IS NOT NULL
      AND COALESCE(JSON_VALUE(request, '$.messages_omitted'), 'false') != 'true'
  `

  const [rows] = await new BigQuery().query({
    query,
    params: { messageIds },
  })

  return new Map((rows as SessionRow[]).map((row) => [row.id, row]))
}

function buildTrace(
  candidate: CandidateRow,
  representativeRows: Map<string, SessionRow>,
) {
  const representativeRow = representativeRows.get(
    candidate.representative_message_id,
  )

  if (!representativeRow) {
    throw new Error(
      `No representative row found for ${candidate.client_id}: ${candidate.representative_message_id}`,
    )
  }

  const request = getRequest(representativeRow)
  const messages = buildFinalMessages(representativeRow)

  return {
    client_id: candidate.client_id,
    model: candidate.model,
    summary: {
      provider_call_count: Number(candidate.provider_call_count),
      first_finished_at: toIso(candidate.first_finished_at),
      last_finished_at: toIso(candidate.last_finished_at),
      representative_message_id: representativeRow.id,
      representative_run_id: representativeRow.run_id,
      representative_finished_at: toIso(representativeRow.finished_at),
      representative_message_count: representativeRow.message_count,
      final_message_count: messages.length,
      tool_count: getTools(request).length,
      appended_final_response: !!representativeRow.response?.trim(),
    },
    tools: getTools(request),
    messages,
  }
}

type SessionTrace = ReturnType<typeof buildTrace>

async function writeTraceFiles(params: {
  outputPath: string
  traceDir: string | null
  dataset: string
  generatedAt: string
  traces: SessionTrace[]
}) {
  const { outputPath, dataset, generatedAt, traces } = params
  const traceDir =
    params.traceDir ?? join(dirname(outputPath), 'deepseek-session-traces')

  await mkdir(traceDir, { recursive: true })

  const files: string[] = []
  for (const trace of traces) {
    const fileName = [
      safeFilePart(trace.model),
      safeFilePart(trace.client_id),
    ].join('__')
    const filePath = join(traceDir, `${fileName}.json`)

    await Bun.write(
      filePath,
      JSON.stringify(
        {
          generated_at: generatedAt,
          dataset,
          ...trace,
        },
        null,
        2,
      ),
    )
    files.push(filePath)
  }

  return files
}

async function main() {
  const args = parseArgs()
  const outputPath = resolve(args.outPath)
  const generatedAt = new Date().toISOString()

  console.log(
    [
      `Querying ${args.dataset}.message`,
      args.startDate || args.endDate
        ? `window: ${args.startDate ?? '-infinity'} to ${args.endDate ?? 'now'}`
        : `window: ${args.lookbackDays}d ending ${args.beforeDays}d ago`,
      args.totalSessions
        ? `total sessions: ${args.totalSessions} (${args.sampleMode})`
        : `sessions per agent: ${args.sessionsPerAgent}`,
      `min representative messages: ${args.minMessages}`,
      args.clientId ? `client_id: ${args.clientId}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
  )
  console.log('')

  const candidates = await fetchCandidateSessions(args)
  const representativeRows = await fetchRepresentativeRows(
    args,
    candidates.map((candidate) => candidate.representative_message_id),
  )
  const traces = candidates.map((candidate) =>
    buildTrace(candidate, representativeRows),
  )

  if (!args.skipAggregate) {
    await mkdir(dirname(outputPath), { recursive: true })
    await Bun.write(
      outputPath,
      JSON.stringify(
        {
          generated_at: generatedAt,
          dataset: OUTPUT_DATASET_NAME,
          lookback_days: args.lookbackDays,
          before_days: args.beforeDays,
          start_date: args.startDate,
          end_date: args.endDate,
          sample_mode: args.sampleMode,
          trace_count: traces.length,
          traces,
        },
        null,
        2,
      ),
    )
  }
  const traceFiles = await writeTraceFiles({
    outputPath,
    traceDir: args.traceDir,
    dataset: OUTPUT_DATASET_NAME,
    generatedAt,
    traces,
  })

  console.log(`Candidate sessions: ${candidates.length}`)
  console.log(`Representative rows fetched: ${representativeRows.size}`)
  if (!args.skipAggregate) {
    console.log(`Wrote session traces to ${outputPath}`)
  }
  console.log(`Wrote ${traceFiles.length} separate trace files:`)
  for (const filePath of traceFiles) {
    console.log(`  ${filePath}`)
  }
  console.log('')

  for (const trace of traces) {
    console.log(
      [
        trace.model,
        `client_id=${trace.client_id}`,
        `calls=${trace.summary.provider_call_count}`,
        `messages=${trace.summary.final_message_count}`,
        `tools=${trace.summary.tool_count}`,
      ].join('  '),
    )
    const firstUser = trace.messages.find((message) => message.role === 'user')
    const lastMessage = trace.messages.at(-1)
    console.log(`  first user: ${shortPreview(firstUser?.content)}`)
    console.log(
      `  last message: ${lastMessage?.role} ${shortPreview(lastMessage?.content)}`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
