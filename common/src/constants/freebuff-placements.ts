/**
 * The placements ad rail — first-party text ads in our own inventory.
 *
 * Distinct from the engagement marketplace in `freebuff-ads.ts`, which sells a
 * real developer engaging with an advertiser's social post. These two share an
 * advertiser, a Stripe customer, a review queue and a login, and share nothing
 * about delivery or billing. They are two tabs of one console, not two
 * products.
 *
 * This file is the metric dictionary. It exists because CTR computed three
 * different ways on three surfaces is how an advertiser stops trusting a
 * dashboard, and the definitions below are the only ones any surface may use.
 */

import { AD_CAMPAIGN_STATUSES } from './freebuff-ads'

import type { AdCampaignStatus } from './freebuff-ads'

/**
 * The bare-bones placements control and delivery planes are wired: campaigns
 * and creatives persist, first-party impressions carry campaign attribution,
 * and clicks settle through the spend ledger.
 *
 * **This constant no longer decides who can reach the console.** That is the
 * `FREEBUFF_PLACEMENTS_AUDIENCE` env knob (`off` | `admin` | `all`, default
 * `off`), read by `placementsAudience()` in
 * `freebuff/web/src/server/advertisers/placements/access.ts`. What survives
 * here is the implementation-state assertion the knob is set against. Delivery
 * rollups expose coverage alongside delivery; an uncovered day is unknown,
 * not a zero and never fixture data.
 */
export const PLACEMENTS_CONSOLE_ENABLED = true

/**
 * Terminal widths the creative preview offers, chosen because these are the
 * widths where inline ad layout actually changes behaviour:
 *
 * - `20` — the transcript renderer's floor. Title and body are both cut hard.
 * - `48` — below this the advertiser's destination domain is not rendered at
 *   all (`MIN_INLINE_WIDTH_WITH_DESTINATION`). This is the surprising one.
 * - `60` — a comfortable terminal, where the ad shows as intended.
 *
 * An earlier draft of the spec offered 60/80/100/120, all four above every
 * real breakpoint, so the preview would have shown an advertiser nothing worth
 * seeing.
 */
/**
 * How many creative variants one campaign may carry.
 *
 * Lives here rather than beside the store because the campaign BUILDER needs
 * it too, and the store imports the database client -- which cannot be pulled
 * into a client component. It used to be duplicated as a literal in both
 * places with a comment asking the reader to keep them in step, which is the
 * arrangement where the API silently rejects what the form just let you build.
 *
 * Raised 10 -> 25 on 2026-08-28: the house subscription campaign wants a
 * variant per angle per surface, and the CTR bias gets better the more it has
 * to choose between. The ceiling exists to keep human review and the delivery
 * rollup manageable, not to protect the picker.
 */
export const MAX_PLACEMENT_CREATIVES_PER_CAMPAIGN = 25

export const PLACEMENT_PREVIEW_WIDTHS = [20, 48, 60] as const
export type PlacementPreviewWidth = (typeof PLACEMENT_PREVIEW_WIDTHS)[number]

/**
 * Days after a click within which saving the advertised service's env var
 * still counts as that campaign's activation.
 *
 * This must be printed on screen next to the activation count. Without a
 * shared rule the advertiser's install count and ours differ and no dispute
 * can be settled — see {@link ATTRIBUTION_WINDOW_COPY}.
 */
export const ACTIVATION_ATTRIBUTION_WINDOW_DAYS = 30

export const ATTRIBUTION_WINDOW_COPY = `Activation counts within ${ACTIVATION_ATTRIBUTION_WINDOW_DAYS} days of the click`

/**
 * Placements an advertiser can buy.
 *
 * EVERY ID HERE IS AN ID A SHIPPING CLIENT ACTUALLY SENDS. Verified against
 * Axiom `ads.fetch_completed` over 7 days, 2026-08-23. That is a stricter test
 * than "exists in the code", and it is the one that matters: an id nobody
 * requests is a campaign that never delivers.
 *
 * Two ways to get this wrong, both of which we did:
 *
 * 1. A SURFACE NAME IS NOT A PLACEMENT. `cli_chat` was listed here once. It is
 *    the surface; the transcript's placement is `CLI-Chat-Inline`.
 *
 * 2. `CLI-Chat-Inline-1..8` ARE NOT SELLABLE, despite existing in
 *    `CLI_CHAT_BATCH_PLACEMENT_IDS`. `getPlacementIds` prefers an explicit
 *    `placementId` over the surface, and every shipping client sends one, so
 *    the batch list is reached only by CLI builds predating the lazy per-slot
 *    auction. Measured: ~395 impressions/day across all eight and falling,
 *    against ~99k/day for `CLI-Chat-Inline`. Do not sell a decaying legacy
 *    path.
 *
 * Keep this in step with `getPlacementIds` in the ads route AND with what
 * clients send. The three disagreeing is a campaign that silently never
 * delivers.
 *
 * Chat was previously listed as unavailable on the grounds of a Gravity
 * exclusivity term. That term does not exist, so chat is sellable -- and it is
 * where nearly all the volume is.
 *
 * `Single-Ad-Unit-1` and `Desktop-Below-Chat` are live legacy slots as well as
 * the primary inline units. They remain sellable until their clients retire;
 * leaving either out would route an advertiser's inventory straight past a
 * rendered surface.
 */
export const PLACEMENT_SLOTS = [
  { id: 'waiting-room-1', surface: 'waiting_room', available: true },
  { id: 'waiting-room-2', surface: 'waiting_room', available: true },
  { id: 'waiting-room-3', surface: 'waiting_room', available: true },
  { id: 'waiting-room-4', surface: 'waiting_room', available: true },
  // The CLI transcript's inline slot. One id, re-auctioned per eligible slot.
  { id: 'CLI-Chat-Inline', surface: 'cli_chat', available: true },
  // Desktop's inline slot -- the largest single placement by fill volume.
  { id: 'Desktop-Inline-Chat', surface: 'cli_chat', available: true },
  { id: 'Desktop-Below-Chat', surface: 'cli_chat', available: true },
  { id: 'Single-Ad-Unit-1', surface: 'cli_chat', available: true },
  {
    id: 'Web-Chat-After-User-Message',
    surface: 'freebuff_web_chat',
    available: true,
  },
  {
    id: 'Web-Chat-After-Assistant-Message',
    surface: 'freebuff_web_chat',
    available: true,
  },
  {
    id: 'Chat-Assistant-Above-Input',
    surface: 'chat_assistant',
    available: true,
  },
] as const

/**
 * The reporting grain a TRACKED LINK click lands on.
 *
 * Deliberately NOT a `PLACEMENT_SLOTS` entry: a tracked link is not a slot,
 * nothing auctions it, nothing serves an impression into it, and adding it to
 * that list would put it in front of an advertiser choosing where their ad
 * appears. But the delivery rollup groups by `placement_id` and `surface`, so
 * an external click has to carry SOME value for both, and every surface that
 * labels a placement will meet these two.
 *
 * `placementSlotLabel` below is what stops that meeting rendering `undefined`.
 */
export const TRACKED_LINK_PLACEMENT_ID = 'tracked-link'
export const TRACKED_LINK_SURFACE = 'tracked_link'

/**
 * A human label for any `placement_id`, including grains no slot describes.
 *
 * `PLACEMENT_SLOTS` is a catalog of things an advertiser can BUY, and the
 * reporting grain is strictly wider than it -- tracked links today, and
 * whatever the next one is. So this is a formatter with a special case, not a
 * dictionary lookup with a hole: `waiting-room-1` still becomes
 * `Waiting room 1` and `CLI-Chat-Inline` still becomes `CLI Chat Inline`,
 * exactly as the breakdown table already rendered them, and an unknown id
 * degrades to a readable string rather than to `undefined`.
 */
export function placementSlotLabel(placementId: string): string {
  if (placementId === TRACKED_LINK_PLACEMENT_ID) return 'Tracked links'
  const [head, ...rest] = placementId.split('-')
  if (!head) return placementId
  return [head[0]!.toUpperCase() + head.slice(1), ...rest].join(' ')
}

/**
 * The metrics an advertiser sees, split by role.
 *
 * `primary` is what they bought. `diagnostic` explains why that number is what
 * it is. The split is a visual one on screen, not merely an ordering — a
 * dashboard that headlines impressions and CTR is the dashboard every other
 * network already ships.
 */
export const PRIMARY_METRICS = [
  'billableClicks',
  'activations',
  'spend',
  'avgCpc',
  'avgCpa',
] as const
export const DIAGNOSTIC_METRICS = [
  'impressions',
  'clicks',
  'ctr',
  'ecpm',
] as const

export type PrimaryMetric = (typeof PRIMARY_METRICS)[number]
export type DiagnosticMetric = (typeof DIAGNOSTIC_METRICS)[number]
/** Legacy conversion labels remain addressable while conversion reporting is
 * intentionally hidden from the CPC MVP UI. */
export type PlacementMetric =
  | PrimaryMetric
  | DiagnosticMetric
  | 'activations'
  | 'costPerActivation'

export const PLACEMENT_METRIC_LABELS: Record<PlacementMetric, string> = {
  activations: 'Billable activations',
  costPerActivation: 'Avg CPA',
  spend: 'Spend',
  impressions: 'Impressions',
  clicks: 'Clicks',
  billableClicks: 'Billable',
  ctr: 'CTR',
  avgCpc: 'Avg CPC',
  avgCpa: 'Avg CPA',
  ecpm: 'Effective CPM',
}

/** The counts every derived metric is computed from. */
export interface PlacementTotals {
  activations: number
  impressionsServed: number
  impressionsViewed: number
  clicks: number
  billableClicks: number
  /**
   * What the statement billed: at campaign grain, the sum of the spend
   * ledger — back-bills, adjustments and campaign-scoped refunds included —
   * never recomputed from a campaign's current price, which would rewrite
   * history the moment anyone edits that price. At creative grain there is no
   * ledger, so this equals {@link deliverySpendCents}.
   */
  spendCents: number
  /**
   * What the delivery and attribution rows themselves charged, summed from
   * their frozen per-click/per-conversion prices. Rate metrics (eCPC, eCPM,
   * cost per result) divide THIS, never {@link spendCents}: a ledger-only
   * line like a manual back-bill pays for delivery the counters cannot see,
   * so dividing billed spend by delivery counts bends every ratio away from
   * the price actually charged.
   */
  deliverySpendCents: number
}

/**
 * Divide, or return null.
 *
 * Null rather than NaN or zero, because "no clicks yet" and "a CTR of zero"
 * are different facts and a new campaign shows the first one for days. The UI
 * renders null as an em dash.
 */
function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  return numerator / denominator
}

/**
 * Clickthrough rate, over **viewed** impressions rather than served ones.
 *
 * Served counts ads the client never painted; using it as the denominator
 * deflates every advertiser's CTR against the numbers they see from other
 * networks. Two caveats belong on screen rather than hidden: the click
 * endpoint does not require that the view pixel fired, so the numerator can
 * outrun the denominator; and "viewed" is a pixel our own client fires, which
 * nothing third-party can verify in a terminal. It is a diagnostic here, never
 * a viewability claim we sell against.
 */
export function ctr(totals: PlacementTotals): number | null {
  return ratio(totals.clicks, totals.impressionsViewed)
}

/** Conversion attribution is not part of the CPC MVP. Kept for broad types. */
export function costPerActivation(totals: PlacementTotals): number | null {
  const perActivation = ratio(totals.spendCents, totals.activations)
  return perActivation === null ? null : perActivation / 100
}

/** Spend per billable click. Billable, not raw — the invoice uses billable. */
export function avgCpc(totals: PlacementTotals): number | null {
  const perClick = ratio(totals.spendCents, totals.billableClicks)
  return perClick === null ? null : perClick / 100
}

/** Spend per verified, payable activation. */
export function avgCpa(totals: PlacementTotals): number | null {
  return costPerActivation(totals)
}

/**
 * Effective CPM — yield per thousand viewed impressions.
 *
 * Derived only. It is what lets an advertiser compare us against the
 * CPM-priced inventory they already buy, and it must never be a field they can
 * type into: we do not sell impressions.
 */
export function ecpm(totals: PlacementTotals): number | null {
  const perImpression = ratio(totals.spendCents, totals.impressionsViewed)
  return perImpression === null ? null : (perImpression / 100) * 1000
}

export function spendUsd(totals: PlacementTotals): number {
  return totals.spendCents / 100
}

/**
 * A campaign's state as an advertiser reads it.
 *
 * These map 1:1 onto the existing `ad_campaign_status` enum plus the
 * `billing_active` flag. There is no new state machine, deliberately — the two
 * campaign types share a lifecycle even though they share nothing about
 * delivery.
 */
export const PLACEMENT_DISPLAY_STATUSES = [
  ...AD_CAMPAIGN_STATUSES,
  'not_funded',
] as const
export type PlacementDisplayStatus = (typeof PLACEMENT_DISPLAY_STATUSES)[number]

export const PLACEMENT_STATUS_LABELS: Record<PlacementDisplayStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  rejected: 'Changes needed',
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended',
  not_funded: 'Not funded',
}

/**
 * An approved campaign with no funding is `active` in the database and not
 * serving in reality. Showing it as "Active" is how an advertiser spends a
 * week wondering why nothing is delivering.
 */
export function placementDisplayStatus(campaign: {
  status: AdCampaignStatus
  billingActive: boolean
}): PlacementDisplayStatus {
  if (campaign.status === 'active' && !campaign.billingActive) {
    return 'not_funded'
  }
  return campaign.status
}

/** Statuses that mean the campaign is capable of serving right now. */
export function isServing(campaign: {
  status: AdCampaignStatus
  billingActive: boolean
}): boolean {
  return campaign.status === 'active' && campaign.billingActive
}

/**
 * Why a campaign is not serving, in the advertiser's terms.
 *
 * Every value here is a state we can actually distinguish. There is no
 * "probably no inventory" — asserting a cause we did not observe turns one
 * support ticket into two.
 */
export const NOT_SERVING_REASONS = [
  'awaiting_review',
  'rejected',
  'balance_empty',
  'not_funded',
  'paused',
  'flight_ended',
  'no_creatives',
  // The two spend states. These name the same conditions the serve path
  // refuses a fill for (`daily_cap_spent` / `total_budget_spent` in
  // `ineligibleReason`), deliberately spelled identically: a campaign the
  // auction has stopped filling and a console still showing a serving dot is
  // the single disparity an advertiser is most likely to notice and least
  // able to explain.
  'daily_cap_spent',
  'total_budget_spent',
] as const
export type NotServingReason = (typeof NOT_SERVING_REASONS)[number]

export const NOT_SERVING_COPY: Record<
  NotServingReason,
  { message: string; action: string | null }
> = {
  awaiting_review: {
    message: 'Awaiting review before this campaign can start serving',
    action: null,
  },
  rejected: {
    message: 'Every creative was rejected — edit them to resume',
    action: 'Edit creatives',
  },
  balance_empty: {
    message: 'Not serving — your balance reached zero',
    action: 'Top up',
  },
  not_funded: {
    message: 'Approved, but not funded yet',
    action: 'Add funds',
  },
  paused: {
    message: 'Paused — resume to start serving again',
    action: 'Resume',
  },
  flight_ended: { message: 'This campaign reached its end date', action: null },
  no_creatives: {
    message: 'No approved creatives to serve',
    action: 'Add a creative',
  },
  // Says when it resumes, because it does. Without the reset time this reads
  // as the same dead end as a spent total budget, and the two are a day and a
  // cap change apart.
  daily_cap_spent: {
    message: 'Paused for today — daily cap reached, resumes at midnight PT',
    action: 'Raise daily cap',
  },
  // No action beyond editing: the budget is spent, and the only way forward
  // is a larger one.
  total_budget_spent: {
    message: 'This campaign spent its total budget',
    action: 'Raise total budget',
  },
}

/**
 * Why a day underspent its cap. Same rule as {@link NOT_SERVING_REASONS}: each
 * of these is recorded, never guessed. `no_inventory` is the most common cause
 * and is exactly the one it is most tempting to assume.
 */
export const UNDERSPEND_REASONS = [
  'no_inventory',
  'review_hold',
  'balance_empty',
  'paused',
  'flight_ended',
] as const
export type UnderspendReason = (typeof UNDERSPEND_REASONS)[number]

export const UNDERSPEND_COPY: Record<UnderspendReason, string> = {
  no_inventory: 'no matching inventory',
  review_hold: 'held for review',
  balance_empty: 'balance reached zero',
  paused: 'campaign paused',
  flight_ended: 'flight ended',
}

/**
 * We never bill above the daily cap or the total budget; clicks that land
 * after a cap is reached are absorbed. Billing $52 against a $50 cap is
 * technically defensible and reads as a bait and switch every single time.
 */
export const OVERSHOOT_POLICY_COPY =
  'You are never billed above your daily cap or total budget.'

// ---------------------------------------------------------------------------
// Daily cap
// ---------------------------------------------------------------------------

/**
 * Bounds for a placements campaign's daily cap, in cents.
 *
 * Shared rather than local to the builder because the campaigns API validates
 * the same range. They were two literals in two files agreeing by hand, which
 * is the arrangement where the API rejects what the form just let you build.
 *
 * The ceiling moved 50_000 -> 500_000 cents on 2026-08-31. It was sized
 * around the fixture campaigns' caps ($25-$50/day) with headroom, and headroom
 * sized off the first advertisers stops being headroom the moment one of them
 * scales: the console offered no way to say a number it already knew how to
 * bill, and the campaign had to be edited by an operator. This is a self-serve
 * ceiling, not a limit on what we will take -- past it an advertiser talks
 * to us.
 *
 * Stated in cents rather than as a dollars-per-day figure because this file is
 * published (scripts/public-export-manifest.txt) and the export's leak check
 * reads `$N,NNN/day` as measured internal spend. That guard is deliberately
 * blunt -- it exists because comments in this package leaked real cost figures
 * once already -- so the phrasing moves here, never the pattern there.
 */
export const PLACEMENT_DAILY_CAP_MIN_CENTS = 500
export const PLACEMENT_DAILY_CAP_MAX_CENTS = 500_000
export const PLACEMENT_DAILY_CAP_DEFAULT_CENTS = 2_500

/** Whole cents inside the bounds, which is exactly what the API accepts. */
export function clampPlacementDailyCapCents(cents: number): number {
  if (!Number.isFinite(cents)) return PLACEMENT_DAILY_CAP_DEFAULT_CENTS
  return Math.min(
    PLACEMENT_DAILY_CAP_MAX_CENTS,
    Math.max(PLACEMENT_DAILY_CAP_MIN_CENTS, Math.round(cents)),
  )
}

/**
 * The caps the slider can land on, ascending.
 *
 * A linear $5-step track to $5,000 is a thousand positions, which buries the
 * range nearly every campaign actually runs in ($25-$50/day) inside the first
 * one percent of it -- a pixel of drag would be tens of dollars, and the low
 * end would be unreachable by dragging at all. So the slider walks a ladder
 * whose step grows with the number: $5 up to $100, $25 up to $500, $100 up to
 * $1,000, $500 up to $5,000. Every position is a cap someone would choose.
 *
 * The ladder is the SLIDER's resolution and nothing else. The numeric input
 * beside it takes any amount in range, and the API validates the bounds only,
 * so a cap typed off the ladder saves exactly as typed and stays that way
 * until the slider is dragged.
 */
export const PLACEMENT_DAILY_CAP_LADDER: readonly number[] = (() => {
  const bands = [
    { throughCents: 10_000, stepCents: 500 },
    { throughCents: 50_000, stepCents: 2_500 },
    { throughCents: 100_000, stepCents: 10_000 },
    { throughCents: PLACEMENT_DAILY_CAP_MAX_CENTS, stepCents: 50_000 },
  ]
  const values = [PLACEMENT_DAILY_CAP_MIN_CENTS]
  for (const band of bands) {
    let cents = values[values.length - 1]!
    while (cents < band.throughCents) {
      cents = Math.min(band.throughCents, cents + band.stepCents)
      values.push(cents)
    }
  }
  return values
})()

/**
 * Where a cap sits on the ladder -- the nearest rung, since a cap typed into
 * the numeric input is under no obligation to be on one. Ties go to the lower
 * rung so the answer never exceeds the ceiling.
 */
export function placementDailyCapLadderIndex(cents: number): number {
  const target = clampPlacementDailyCapCents(cents)
  let best = 0
  for (let index = 1; index < PLACEMENT_DAILY_CAP_LADDER.length; index += 1) {
    const rung = PLACEMENT_DAILY_CAP_LADDER[index]!
    if (
      Math.abs(rung - target) <
      Math.abs(PLACEMENT_DAILY_CAP_LADDER[best]! - target)
    ) {
      best = index
    }
  }
  return best
}
