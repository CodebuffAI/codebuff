/**
 * Operational events that belong in Axiom but not in product analytics.
 *
 * CLI logs normally redact structured info payloads before shipping and also
 * mirror a sampled `cli_log` event to PostHog. This allowlist lets a small set
 * of content-free operational events retain useful numeric metadata in Axiom
 * without becoming product events or providing a general redaction bypass.
 */

export const CONTEXT_PRUNING_COMPLETED_EVENT =
  'context_pruning.completed' as const

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
} as const satisfies Record<string, 'string' | 'number' | 'boolean'>

export type AxiomOnlyLogEvent = {
  event: typeof CONTEXT_PRUNING_COMPLETED_EVENT
  data: Record<string, string | number | boolean>
}

/**
 * Return a sanitized Axiom-only event, or null for ordinary logger payloads.
 * Unknown keys and unexpected value types are deliberately discarded.
 */
export function getAxiomOnlyLogEvent(
  data: unknown,
  event?: string | null,
): AxiomOnlyLogEvent | null {
  const record =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  if (
    record.axiomEvent !== CONTEXT_PRUNING_COMPLETED_EVENT &&
    event !== CONTEXT_PRUNING_COMPLETED_EVENT
  ) {
    return null
  }

  const sanitized: Record<string, string | number | boolean> = {}
  for (const [key, expectedType] of Object.entries(CONTEXT_PRUNING_FIELDS)) {
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

  return {
    event: CONTEXT_PRUNING_COMPLETED_EVENT,
    data: sanitized,
  }
}
