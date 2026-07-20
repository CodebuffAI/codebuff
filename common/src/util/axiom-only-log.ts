/**
 * Operational events that belong in Axiom but not in product analytics.
 *
 * CLI logs normally redact structured info payloads before shipping and also
 * mirror a sampled `cli_log` event to PostHog. This allowlist lets a small set
 * of content-free operational events retain useful numeric/string/boolean
 * metadata in Axiom without becoming product events or providing a general
 * redaction bypass — each event declares an explicit field allowlist, and
 * unknown keys or unexpected value types are always discarded.
 */

export const CONTEXT_PRUNING_COMPLETED_EVENT =
  'context_pruning.completed' as const

/** Stream-cut / output-limit recovery (sdk/src/impl/stream-interruption.ts,
 *  packages/agent-runtime/src/tools/stream-parser.ts). `metric` distinguishes
 *  the log sites (stream_recovery_detected / _rescued) that share this one
 *  allowlisted event — `_gave_up` logs at error level, which already ships
 *  raw and doesn't need the allowlist. */
export const STREAM_RECOVERY_EVENT = 'stream_recovery' as const

type AxiomOnlyFieldType = 'string' | 'number' | 'boolean'
type AxiomOnlyFieldSchema = Record<string, AxiomOnlyFieldType>

const CONTEXT_PRUNING_FIELDS = {
  agent_run_id: 'string',
  parent_agent_run_id: 'string',
  client_session_id: 'string',
  client_request_id: 'string',
  trigger_reason: 'string',
  context_token_count: 'number',
  max_context_length: 'number',
  cache_gap_ms: 'number',
  cache_expiry_ms: 'number',
  previous_summary_entry_count: 'number',
  user_budget: 'number',
  user_entry_count: 'number',
  dropped_user_entry_count: 'number',
  assistant_tool_budget: 'number',
  assistant_tool_entry_count: 'number',
  dropped_assistant_tool_entry_count: 'number',
  summary_estimated_tokens: 'number',
  mid_turn: 'boolean',
  live_user_prompt_found: 'boolean',
  live_user_prompt_text_preserved: 'boolean',
  newest_entry_forced: 'boolean',
} as const satisfies AxiomOnlyFieldSchema

const STREAM_RECOVERY_FIELDS = {
  metric: 'string',
  source: 'string',
  model: 'string',
  agentId: 'string',
  runId: 'string',
  userInputId: 'string',
  finishReason: 'string',
  hasYieldedContent: 'boolean',
  consecutive: 'number',
} as const satisfies AxiomOnlyFieldSchema

export type AxiomOnlyLogEvent = {
  event:
    | typeof CONTEXT_PRUNING_COMPLETED_EVENT
    | typeof STREAM_RECOVERY_EVENT
  data: Record<string, string | number | boolean>
}

/** Keep only the allowlisted keys whose value matches the declared type
 *  (strings truncated); everything else is dropped. */
function sanitizeAllowlistedFields(
  record: Record<string, unknown>,
  fields: AxiomOnlyFieldSchema,
): AxiomOnlyLogEvent['data'] {
  const sanitized: AxiomOnlyLogEvent['data'] = {}
  for (const [key, expectedType] of Object.entries(fields)) {
    const value = record[key]
    if (typeof value !== expectedType) continue
    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 200)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value
    } else if (typeof value === 'boolean') {
      sanitized[key] = value
    }
  }
  return sanitized
}

/**
 * Return a sanitized Axiom-only event, or null for ordinary logger payloads.
 * The event name comes from `data.axiomEvent` (the in-process marker set at
 * the log call site) or the `event` param (the wire-format field a caller
 * already extracted, e.g. the server-side sink re-checking a persisted
 * `LogRow`). Unknown keys and unexpected value types are deliberately
 * discarded.
 *
 * Matched by exact equality (not a lookup keyed on the caller-supplied name)
 * so a value like 'constructor' can't resolve through an object's prototype.
 */
export function getAxiomOnlyLogEvent(
  data: unknown,
  event?: string | null,
): AxiomOnlyLogEvent | null {
  const record =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  const eventName =
    typeof record.axiomEvent === 'string' ? record.axiomEvent : event

  if (eventName === CONTEXT_PRUNING_COMPLETED_EVENT) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(record, CONTEXT_PRUNING_FIELDS),
    }
  }
  if (eventName === STREAM_RECOVERY_EVENT) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(record, STREAM_RECOVERY_FIELDS),
    }
  }
  return null
}
