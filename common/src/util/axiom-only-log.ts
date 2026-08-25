import { AnalyticsEvent } from '../constants/analytics-events'

/**
 * Operational events that belong in Axiom but not in product analytics.
 *
 * This allowlist lets a small set of content-free operational events retain
 * useful numeric/string/boolean metadata without becoming product events or
 * providing a general redaction bypass. Unknown fields and unexpected value
 * types are always discarded.
 */

export const CONTEXT_PRUNING_COMPLETED_EVENT =
  'context_pruning.completed' as const

/** Stream-cut / output-limit recovery (sdk/src/impl/stream-interruption.ts,
 *  packages/agent-runtime/src/tools/stream-parser.ts). `metric` distinguishes
 *  the log sites (stream_recovery_detected / _rescued) that share this one
 *  allowlisted event — `_gave_up` logs at error level, which already ships
 *  raw and doesn't need the allowlist. */
export const STREAM_RECOVERY_EVENT = 'stream_recovery' as const
export const ADS_FETCH_COMPLETED_EVENT = AnalyticsEvent.ADS_FETCH_COMPLETED
export const ADS_FIRST_PARTY_DECISION_EVENT =
  AnalyticsEvent.ADS_FIRST_PARTY_DECISION
export const ADS_FIRST_PARTY_SETTLEMENT_EVENT =
  AnalyticsEvent.ADS_FIRST_PARTY_SETTLEMENT
export const ADS_FIRST_PARTY_CLICK_RECORDED_EVENT =
  'ads.first_party_click_recorded' as const
export const ADS_FIRST_PARTY_IMPRESSION_RECORDED_EVENT =
  'ads.first_party_impression_recorded' as const
/** Advertiser S2S conversion postbacks. This event is deliberately limited to
 * a small, content-free operational census; partner credentials and the
 * opaque click/event identifiers never leave the request handler. */
export const ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT =
  'ads.external_conversion_postback' as const

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

const ADS_FETCH_COMPLETED_FIELDS = {
  outcome: 'string',
  requested_provider: 'string',
  served_provider: 'string',
  // This is a producer-encoded, bounded string such as
  // "gravity>first_party>carbon". Keep the raw attempted_providers array out
  // of Axiom so operational events remain scalar-only.
  attempted_provider_chain: 'string',
  experiment_arm: 'string',
  first_party_route: 'string',
  first_party_primary_percent: 'number',
  first_party_backfill_enabled: 'boolean',
  /**
   * Exact primary allocation is intentionally represented by an opaque,
   * operator-chosen cohort label rather than a campaign or advertiser id.
   * Producers emit `none` / 0 when the request is not assigned to a primary
   * cohort, so an absent field is distinguishable from a deliberate control.
   */
  first_party_primary_cohort: 'string',
  first_party_primary_cohort_percent: 'number',
  /** The opaque cohort that actually produced a first-party fill, or `none`. */
  first_party_served_cohort: 'string',
  /** `primary`, `gravity_no_fill_backfill`, or `none`. */
  first_party_entrypoint: 'string',
  /** Whether the immediately preceding Gravity attempt filled, no-filled, or
   * failed. This makes recovered no-fill inventory observable without logging
   * any campaign or creative identity. */
  gravity_outcome: 'string',
  selection_reason: 'string',
  ad_count: 'number',
  surface: 'string',
  placement_id: 'string',
  duration_ms: 'number',
  client_ua_product: 'string',
  client_ua_version: 'string',
} as const satisfies AxiomOnlyFieldSchema

/**
 * First-party inventory selection is operational telemetry only. In
 * particular, campaign/creative/placement arrays and user/session IDs stay
 * out: their cardinality makes them unsuitable for the event stream and they
 * are available in the database when an operator needs drill-down.
 */
const ADS_FIRST_PARTY_DECISION_FIELDS = {
  outcome: 'string',
  primary_allocation_invalid: 'boolean',
  no_fill_reason: 'string',
  selection_reason: 'string',
  ad_count: 'number',
  placement_count: 'number',
  candidate_count: 'number',
  candidate_load_ms: 'number',
  frequency_status: 'string',
  frequency_unavailable_cause: 'string',
  frequency_reservation_ms: 'number',
  duration_ms: 'number',
} as const satisfies AxiomOnlyFieldSchema

/** Settlement telemetry deliberately excludes impression, campaign, and
 * advertiser identifiers. The bounded status/reason and amount fields are
 * sufficient for charge and absorption dashboards. */
const ADS_FIRST_PARTY_SETTLEMENT_FIELDS = {
  billing_model: 'string',
  settlement_status: 'string',
  absorbed_reason: 'string',
  amount_cents: 'number',
  balance_cents: 'number',
  duration_ms: 'number',
} as const satisfies AxiomOnlyFieldSchema

const ADS_FIRST_PARTY_TRACKING_FIELDS = {
  provider: 'string',
  surface: 'string',
  placement_id: 'string',
  already_clicked: 'boolean',
  impression_recorded: 'boolean',
  pixel_count: 'number',
} as const satisfies AxiomOnlyFieldSchema

/** Keep the advertiser postback stream safe to aggregate. In particular this
 * must not grow into an attribution/debugging record: the database owns that
 * drill-down and Axiom receives only bounded operational dimensions. */
const ADS_EXTERNAL_CONVERSION_POSTBACK_FIELDS = {
  outcome: 'string',
  rejection_reason: 'string',
  event_type: 'string',
  traffic_class: 'string',
  primary_allocation_cohort: 'string',
  settlement_status: 'string',
  charged_cents: 'number',
  duration_ms: 'number',
} as const satisfies AxiomOnlyFieldSchema

export type AxiomOnlyLogEvent = {
  event:
    | typeof CONTEXT_PRUNING_COMPLETED_EVENT
    | typeof STREAM_RECOVERY_EVENT
    | typeof ADS_FETCH_COMPLETED_EVENT
    | typeof ADS_FIRST_PARTY_DECISION_EVENT
    | typeof ADS_FIRST_PARTY_SETTLEMENT_EVENT
    | typeof ADS_FIRST_PARTY_CLICK_RECORDED_EVENT
    | typeof ADS_FIRST_PARTY_IMPRESSION_RECORDED_EVENT
    | typeof ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT
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
  if (eventName === ADS_FETCH_COMPLETED_EVENT) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(record, ADS_FETCH_COMPLETED_FIELDS),
    }
  }
  if (eventName === ADS_FIRST_PARTY_DECISION_EVENT) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(record, ADS_FIRST_PARTY_DECISION_FIELDS),
    }
  }
  if (eventName === ADS_FIRST_PARTY_SETTLEMENT_EVENT) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(
        record,
        ADS_FIRST_PARTY_SETTLEMENT_FIELDS,
      ),
    }
  }
  if (
    eventName === ADS_FIRST_PARTY_CLICK_RECORDED_EVENT ||
    eventName === ADS_FIRST_PARTY_IMPRESSION_RECORDED_EVENT
  ) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(record, ADS_FIRST_PARTY_TRACKING_FIELDS),
    }
  }
  if (eventName === ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT) {
    return {
      event: eventName,
      data: sanitizeAllowlistedFields(
        record,
        ADS_EXTERNAL_CONVERSION_POSTBACK_FIELDS,
      ),
    }
  }
  return null
}
