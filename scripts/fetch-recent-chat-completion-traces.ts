/**
 * Fetch and reconstruct recent chat completion traces from BigQuery.
 *
 * Usage:
 *   bun scripts/fetch-recent-chat-completion-traces.ts
 *   bun scripts/fetch-recent-chat-completion-traces.ts --prod --limit 5
 *   infisical run --env=prod --silent -- bun scripts/fetch-recent-chat-completion-traces.ts --prod
 */

import { BigQuery } from '@google-cloud/bigquery'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

type Args = {
  dataset: string
  limit: number
  lookbackHours: number
  outDir: string
  traceSessionId: string | null
}

type TraceRow = {
  trace_session_id: string
  agent_id: string
  created_at: unknown
  message_count: number
  message_start_index: number
  messages_json: string | null
}

type ChatMessage = Record<string, unknown> & {
  role?: string
  content?: unknown
}

type TraceCall = Omit<TraceRow, 'messages_json'> & {
  created_at: string
  messages: ChatMessage[]
}

type TraceSession = {
  trace_session_id: string
  agent_ids: string[]
  first_created_at: string
  last_created_at: string
  messages: ChatMessage[]
  incomplete: boolean
}

type TraceSessionIndexEntry = {
  trace_session_id: string
  file: string
  first_created_at: string
  last_created_at: string
  agent_ids: string[]
  message_count: number
  incomplete: boolean
}

type TraceFile = {
  trace_session_id: string
  messages: ChatMessage[]
}

function printHelp() {
  console.log(`Fetch recent chat completion traces from BigQuery.

Usage:
  bun scripts/fetch-recent-chat-completion-traces.ts [options]

Options:
  --prod                 Use codebuff_data instead of codebuff_data_dev.
  --dataset name         Explicit BigQuery dataset name.
  --limit n              Number of recent trace sessions to fetch. Default: 3.
  --lookback-hours n     Recent window to scan and reconstruct. Default: 24.
  --trace-session-id id  Fetch one known trace session id.
  --out-dir path         Output directory. Default: .context/recent-chat-completion-traces.
  --help                 Show this message.
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

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  return {
    dataset:
      readStringFlag(argv, '--dataset', null) ??
      (argv.includes('--prod') ? 'codebuff_data' : 'codebuff_data_dev'),
    limit: readNumberFlag(argv, '--limit', 3),
    lookbackHours: readNumberFlag(argv, '--lookback-hours', 24),
    traceSessionId: readStringFlag(argv, '--trace-session-id', null),
    outDir:
      readStringFlag(argv, '--out-dir', null) ??
      readStringFlag(argv, '--out', null) ??
      '.context/recent-chat-completion-traces',
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value)
  }
  return String(value)
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  const parsed = JSON.parse(value)
  return parsed === null ? fallback : (parsed as T)
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function redactForPreview(text: string): string {
  return text
    .replace(
      /\b(?:api[_-]?key|access[_-]?key|secret|token|password|passwd|pwd)=([^&\s"'`]+)/gi,
      (match) => `${match.split('=')[0]}=[REDACTED]`,
    )
    .replace(
      /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
      '[REDACTED_TOKEN]',
    )
    .replace(
      /\b(?:sk|pk|gho|ghp|glpat|xox[baprs])-?[A-Za-z0-9_-]{16,}\b/g,
      '[REDACTED_TOKEN]',
    )
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED_HEX]')
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, (match) =>
      /[A-Za-z]/.test(match) && /\d/.test(match) ? '[REDACTED_SECRET]' : match,
    )
}

function getMessagePreview(message: ChatMessage | undefined): string {
  if (!message) return '(none)'
  const role = typeof message.role === 'string' ? message.role : 'unknown'
  const content =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content)
  return `${role}: ${redactForPreview((content ?? '').replace(/\s+/g, ' ')).slice(0, 120)}`
}

function applyMessageDelta(params: {
  existingMessages: ChatMessage[]
  row: TraceCall
}) {
  const { existingMessages, row } = params
  const reconstructed = [...existingMessages]
  row.messages.forEach((message, index) => {
    reconstructed[row.message_start_index + index] = message
  })
  return reconstructed.slice(0, row.message_count)
}

function normalizeRow(row: TraceRow): TraceCall {
  return {
    ...row,
    created_at: toIso(row.created_at),
    messages: parseJson<ChatMessage[]>(row.messages_json, []),
  }
}

function reconstructTraceSessions(rows: TraceRow[]): TraceSession[] {
  const sessions = new Map<string, TraceSession>()
  const workingMessages = new Map<string, ChatMessage[]>()

  for (const rawRow of rows) {
    const row = normalizeRow(rawRow)
    const sessionKey = row.trace_session_id

    let session = sessions.get(sessionKey)
    if (!session) {
      session = {
        trace_session_id: row.trace_session_id,
        agent_ids: [],
        first_created_at: row.created_at,
        last_created_at: row.created_at,
        messages: [],
        incomplete: false,
      }
      sessions.set(sessionKey, session)
    }

    if (!session.agent_ids.includes(row.agent_id)) {
      session.agent_ids.push(row.agent_id)
    }
    const currentMessages = workingMessages.get(sessionKey) ?? []
    if (row.message_start_index > currentMessages.length) {
      session.incomplete = true
    }

    const reconstructedMessages = applyMessageDelta({
      existingMessages: currentMessages,
      row,
    })
    workingMessages.set(sessionKey, reconstructedMessages)
    if (
      reconstructedMessages.length > 0 &&
      reconstructedMessages.length >= session.messages.length
    ) {
      session.messages = reconstructedMessages
    }

    if (row.created_at < session.first_created_at) {
      session.first_created_at = row.created_at
    }
    if (row.created_at > session.last_created_at) {
      session.last_created_at = row.created_at
    }
  }

  return [...sessions.values()].sort((a, b) =>
    b.last_created_at.localeCompare(a.last_created_at),
  )
}

async function fetchRows(args: Args): Promise<TraceRow[]> {
  const bigquery = new BigQuery()
  const table = `\`${args.dataset}.chat_completion_traces\``
  const fields = `
    trace_session_id,
    agent_id,
    created_at,
    message_count,
    message_start_index,
    TO_JSON_STRING(messages) AS messages_json
  `

  const query = args.traceSessionId
    ? `
      SELECT ${fields}
      FROM ${table}
      WHERE trace_session_id = @traceSessionId
        AND trace_lineage_id = trace_session_id
        AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookbackHours HOUR)
      ORDER BY trace_session_id, created_at, id
    `
    : `
      WITH recent_rows AS (
        SELECT *
        FROM ${table}
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookbackHours HOUR)
          AND trace_lineage_id = trace_session_id
      ),
      recent_sessions AS (
        SELECT trace_session_id, MAX(created_at) AS last_created_at
        FROM recent_rows
        GROUP BY trace_session_id
        ORDER BY last_created_at DESC
        LIMIT @limit
      )
      SELECT ${fields}
      FROM recent_rows
      JOIN recent_sessions USING (trace_session_id)
      ORDER BY trace_session_id, created_at, id
    `

  const [rows] = await bigquery.query({
    query,
    params: {
      limit: args.limit,
      lookbackHours: args.lookbackHours,
      ...(args.traceSessionId ? { traceSessionId: args.traceSessionId } : {}),
    },
  })

  return rows as TraceRow[]
}

function printSummary(args: Args, sessions: TraceSession[]) {
  console.log(
    `Fetched ${sessions.length} trace session(s) from ${args.dataset}.chat_completion_traces`,
  )
  console.log(`Lookback: ${args.lookbackHours} hour(s)`)

  for (const session of sessions) {
    console.log('')
    console.log(`Trace session: ${session.trace_session_id}`)
    console.log(`  messages=${session.messages.length}`)
    console.log(
      `  first=${session.first_created_at} last=${session.last_created_at}`,
    )
    console.log(
      `  agents=${session.agent_ids.join(', ')}${session.incomplete ? ' incomplete=true' : ''}`,
    )
    console.log(`  last_message=${getMessagePreview(session.messages.at(-1))}`)
  }
}

function buildIndexEntry(session: TraceSession): TraceSessionIndexEntry {
  return {
    trace_session_id: session.trace_session_id,
    file: `${safeFilePart(session.trace_session_id)}.json`,
    first_created_at: session.first_created_at,
    last_created_at: session.last_created_at,
    agent_ids: session.agent_ids,
    message_count: session.messages.length,
    incomplete: session.incomplete,
  }
}

function buildTraceFile(session: TraceSession): TraceFile {
  return {
    trace_session_id: session.trace_session_id,
    messages: session.messages,
  }
}

async function main() {
  const args = parseArgs()
  const rows = await fetchRows(args)
  const sessions = reconstructTraceSessions(rows)
  const outDir = resolve(args.outDir)
  const indexEntries = sessions.map(buildIndexEntry)

  await mkdir(outDir, { recursive: true })
  await Promise.all(
    sessions.map((session, index) =>
      writeFile(
        join(outDir, indexEntries[index]!.file),
        JSON.stringify(buildTraceFile(session), null, 2),
      ),
    ),
  )
  await writeFile(
    join(outDir, 'index.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        dataset: args.dataset,
        lookback_hours: args.lookbackHours,
        trace_session_id: args.traceSessionId,
        sessions: indexEntries,
      },
      null,
      2,
    ),
  )

  printSummary(args, sessions)
  console.log('')
  console.log(
    `Wrote ${sessions.length} trace file(s) and index.json to ${outDir}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
