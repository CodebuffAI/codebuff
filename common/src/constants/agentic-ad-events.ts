/**
 * The agentic-ads proposal funnel — the event vocabulary for sponsored
 * proposals served through the first-party placements rail.
 *
 * A sponsored proposal moves through a funnel that is longer than a display
 * ad's serve/view/click: it is offered, a user accepts it, an agent run makes
 * a PR, the PR lands and merges, and the advertiser may later observe
 * downstream activation on their own side. Every stage below is recorded so
 * the next campaign can be priced from measured drop-off — but recording is
 * all most of them do.
 *
 * ## The billing rule (decision 2026-08-27)
 *
 * Billing is CPC where the click IS the proposal Accept. The accept flows
 * through the rail's existing first-party click path
 * (`settleFirstPartyClick`), exactly like a display click on the same
 * campaign — nothing in THIS vocabulary ever settles. Every other funnel
 * event is pure telemetry: it must never create a charge, move advertiser
 * ledger balance, or touch a user's credits. `pr_made`/`landed`/`merged`
 * price the NEXT campaign; they do not bill this one.
 *
 * This file is deliberately dependency-free so the Postgres schema
 * (`packages/internal/src/db/schema.ts`), the ad-serving rail, and Convex
 * modules (`freebuff/web/convex/ads/*`) can all import the same closed set.
 */

export const AGENTIC_FUNNEL_EVENT_TYPES = [
  /** A sponsored proposal card was offered to a user. */
  'proposal_offered',
  /**
   * The user pressed Accept. This is the one billable stage, and it bills as
   * the campaign's CPC CLICK through the existing first-party click
   * settlement — never through funnel-event recording.
   */
  'accepted',
  /** The sponsored run opened a pull request. */
  'pr_made',
  /** The PR's branch landed (CI green, pushed). */
  'landed',
  /** The PR was merged by the repo's owners. */
  'merged',
  /** The run installed the advertiser's MCP server. */
  'mcp_installed',
  /** The run provisioned or wired an API key for the advertiser's service. */
  'api_key_issued',
  /** Advertiser-side: the user created an account with the advertiser. */
  'account_created',
  /**
   * Advertiser-side: the integrated tool was used. Recurring by design — the
   * advertiser may report it many times with distinct event ids.
   */
  'tool_used',
] as const

export type AgenticFunnelEventType = (typeof AGENTIC_FUNNEL_EVENT_TYPES)[number]

/**
 * The `accepted` event's idempotency key, derived from the PROPOSAL id.
 *
 * Funnel recording dedupes on `(campaignId, eventId)`, so the key is what
 * makes "Accept twice records one row" true rather than hoped for. The
 * proposal id is the only identifier that is stable across a retried
 * settlement, a redelivered scheduler run and a second Accept attempt — an
 * impression token would be equally stable but is absent on a seeded row, and
 * a fresh uuid per attempt would record the same accept twice.
 *
 * Prefixed rather than used bare so a future funnel event derived from the
 * same proposal (a `dismissed` census, say) cannot collide with this one.
 *
 * Lives HERE, in the dependency-free vocabulary, because the producer (the
 * Next settle route) and the consumer of the guarantee (Convex, which may
 * never import `@codebuff/internal`) must agree on it without either one
 * importing the other.
 */
export function agenticAcceptEventId(proposalId: string): string {
  return `accept_${proposalId}`
}

/**
 * The only funnel stage that may ever bill, and it bills as a click. Kept as
 * data so tests can prove the rule instead of trusting a comment.
 */
export const AGENTIC_BILLABLE_FUNNEL_EVENT_TYPES = ['accepted'] as const

export function isBillableAgenticFunnelEvent(
  eventType: AgenticFunnelEventType,
): boolean {
  return (AGENTIC_BILLABLE_FUNNEL_EVENT_TYPES as readonly string[]).includes(
    eventType,
  )
}

/**
 * The subset an advertiser may report through the S2S postback
 * (`POST /api/ads/agentic/postback`). Everything else is observed by our own
 * side (the proposal surface and the sponsored run) and must not be
 * accepted from a partner: an advertiser asserting `merged` about our own
 * run would be self-reported telemetry about facts we can read directly.
 */
export const AGENTIC_POSTBACK_EVENT_TYPES = [
  'account_created',
  'tool_used',
] as const

export type AgenticPostbackEventType =
  (typeof AGENTIC_POSTBACK_EVENT_TYPES)[number]

/** Who observed the event: our own serving/run pipeline, or the advertiser. */
export const AGENTIC_FUNNEL_EVENT_SOURCES = [
  'internal',
  'advertiser_postback',
] as const

export type AgenticFunnelEventSource =
  (typeof AGENTIC_FUNNEL_EVENT_SOURCES)[number]
