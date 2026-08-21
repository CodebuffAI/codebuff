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
 * The placements console is unbuilt inventory-side: nothing serves a
 * first-party ad yet, `ad_impression` carries no campaign id, and there is no
 * spend ledger. While this is `false` the console renders from fixtures and
 * must never be shown to an advertiser as their real numbers.
 *
 * **This constant no longer decides who can reach the console.** That is the
 * `FREEBUFF_PLACEMENTS_AUDIENCE` env knob (`off` | `admin` | `all`, default
 * `off`), read by `placementsAudience()` in
 * `freebuff/web/src/server/advertisers/placements/access.ts`. What survives
 * here is the statement of FACT the knob is set against: the data behind these
 * screens is invented. It stays `false`, and stays exported, because the
 * fixture-vs-real distinction is what the UI cites — flip it only once
 * campaign attribution and the spend ledger actually exist.
 */
export const PLACEMENTS_CONSOLE_ENABLED = false

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
 * Placements an advertiser can buy today. `cli_chat` is deliberately listed
 * and disabled rather than omitted: it is the placement every advertiser asks
 * about, and Gravity's exclusivity term is what blocks it, not our roadmap.
 */
export const PLACEMENT_SLOTS = [
  { id: 'waiting-room-1', surface: 'waiting_room', available: true },
  { id: 'waiting-room-2', surface: 'waiting_room', available: true },
  { id: 'waiting-room-3', surface: 'waiting_room', available: true },
  { id: 'waiting-room-4', surface: 'waiting_room', available: true },
  { id: 'cli_chat', surface: 'cli_chat', available: false },
] as const

/**
 * The metrics an advertiser sees, split by role.
 *
 * `primary` is what they bought. `diagnostic` explains why that number is what
 * it is. The split is a visual one on screen, not merely an ordering — a
 * dashboard that headlines impressions and CTR is the dashboard every other
 * network already ships.
 */
export const PRIMARY_METRICS = [
  'activations',
  'costPerActivation',
  'spend',
] as const
export const DIAGNOSTIC_METRICS = [
  'impressions',
  'clicks',
  'billableClicks',
  'ctr',
  'avgCpc',
  'ecpm',
] as const

export type PrimaryMetric = (typeof PRIMARY_METRICS)[number]
export type DiagnosticMetric = (typeof DIAGNOSTIC_METRICS)[number]
export type PlacementMetric = PrimaryMetric | DiagnosticMetric

export const PLACEMENT_METRIC_LABELS: Record<PlacementMetric, string> = {
  activations: 'Activations',
  costPerActivation: 'Cost per activation',
  spend: 'Spend',
  impressions: 'Impressions',
  clicks: 'Clicks',
  billableClicks: 'Billable',
  ctr: 'CTR',
  avgCpc: 'Avg CPC',
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
   * Always the sum of the spend ledger, never recomputed from a campaign's
   * current price — deriving it rewrites history the moment anyone edits that
   * price.
   */
  spendCents: number
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
  return ratio(totals.billableClicks, totals.impressionsViewed)
}

/** Spend per activation — the number an advertiser actually judges us on. */
export function costPerActivation(totals: PlacementTotals): number | null {
  const perActivation = ratio(totals.spendCents, totals.activations)
  return perActivation === null ? null : perActivation / 100
}

/** Spend per billable click. Billable, not raw — the invoice uses billable. */
export function avgCpc(totals: PlacementTotals): number | null {
  const perClick = ratio(totals.spendCents, totals.billableClicks)
  return perClick === null ? null : perClick / 100
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
