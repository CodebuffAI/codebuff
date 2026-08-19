/**
 * The advertiser marketplace: what an engagement costs, what a campaign may
 * buy, and what a promoted post is allowed to be.
 *
 * ## The economics in one paragraph
 *
 * An advertiser funds a campaign at a whole-dollar DAILY rate, charged as a
 * daily subscription for as long as the campaign runs. That one number is both
 * the PRICE and the DELIVERY CAP: `AD_ENGAGEMENT_PRICE_CENTS` divides it into
 * engagements, so $10/day is $10 a day and up to 20 engagements a day, and the
 * dashboard says exactly that.
 *
 * `AD_ENGAGEMENT_PRICE_CENTS` is therefore a DIVISOR, not a line item. Nothing
 * is billed per engagement — see `server/advertisers/billing.ts` for why the
 * metered version was replaced.
 *
 * ## Why flat pricing, and why $0.50
 *
 * Auctions are the right answer when supply is scarce and buyers differ in
 * willingness to pay. Neither is true here at launch: the supply is our own
 * users' attention, and it is elastic in the only direction that matters
 * (more posts to engage with makes the Earn page *better*, not worse). A flat
 * price means an advertiser can compute their reach before they sign up, which
 * is the single thing every self-serve ad product gets wrong.
 *
 * $0.50 is anchored on what the alternative costs. A LinkedIn or X promoted
 * post is billed per impression or per click and routinely lands in the
 * $8-15 CPM / $2-5 CPC range for a developer audience — and buys *impressions*,
 * which the platforms then use as a reason to suppress the post's organic
 * reach. Here the unit is an engagement, engagements are the input to every
 * social ranking function there is, and the post's organic distribution goes
 * UP rather than down.
 */

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * What one approved engagement draws against the daily budget.
 *
 * The rate that turns a daily rate into a delivery cap, not a price the
 * advertiser is ever invoiced at — they pay `daily_budget_cents` per day
 * whatever the day delivers.
 */
export const AD_ENGAGEMENT_PRICE_CENTS = 50

/** Floor for a campaign's daily rate, and the smallest daily charge. Twenty
 *  engagements a day is the least delivery that produces a legible result
 *  rather than noise. */
export const AD_MIN_DAILY_BUDGET_CENTS = 1_000

/** Daily rates are chosen in $5 steps. Increments smaller than the price of
 *  ten engagements make the slider precise about a number that is inherently
 *  approximate — delivery is capped by supply, not by the cent. */
export const AD_DAILY_BUDGET_STEP_CENTS = 500

/** Slider ceiling. Not a hard limit on what we will take — an advertiser who
 *  wants more talks to us — but past this the self-serve flow stops being the
 *  right shape. */
export const AD_MAX_DAILY_BUDGET_CENTS = 100_000

export function engagementsForDailyBudget(cents: number): number {
  return Math.floor(cents / AD_ENGAGEMENT_PRICE_CENTS)
}

/** Snap an arbitrary cent amount onto the ladder the slider offers. Applied
 *  server-side as well as in the UI: the API is public and a hand-rolled
 *  request must not be able to buy $10.37/day. */
export function normalizeDailyBudgetCents(cents: number): number {
  const stepped =
    Math.round(cents / AD_DAILY_BUDGET_STEP_CENTS) * AD_DAILY_BUDGET_STEP_CENTS
  return Math.min(
    AD_MAX_DAILY_BUDGET_CENTS,
    Math.max(AD_MIN_DAILY_BUDGET_CENTS, stepped),
  )
}

export function isValidDailyBudgetCents(cents: number): boolean {
  return (
    Number.isInteger(cents) &&
    cents >= AD_MIN_DAILY_BUDGET_CENTS &&
    cents <= AD_MAX_DAILY_BUDGET_CENTS &&
    cents % AD_DAILY_BUDGET_STEP_CENTS === 0
  )
}

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

export const AD_PLATFORMS = ['twitter', 'linkedin', 'reddit'] as const
export type AdPlatform = (typeof AD_PLATFORMS)[number]

export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  twitter: 'X / Twitter',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
}

/**
 * What "engaged" means on each platform, in the user's own words.
 *
 * Reddit is deliberately different. It has no repost, its culture punishes
 * anything that reads as astroturf harder than either other platform, and a
 * brigaded thread gets the *advertiser* banned rather than us. So Reddit buys
 * an upvote and a genuine comment, and the copy everywhere says "genuine".
 */
export const AD_PLATFORM_ACTIONS: Record<AdPlatform, readonly string[]> = {
  twitter: ['Like the post', 'Reply with a real comment', 'Repost it'],
  linkedin: ['React to the post', 'Comment something real', 'Repost it'],
  reddit: ['Upvote the post', 'Leave a genuine comment'],
}

/** Host allowlist per platform, used to validate a submitted post URL. Hosts
 *  are matched exactly or as a subdomain suffix. */
export const AD_PLATFORM_HOSTS: Record<AdPlatform, readonly string[]> = {
  twitter: ['twitter.com', 'x.com'],
  linkedin: ['linkedin.com'],
  reddit: ['reddit.com', 'redd.it'],
}

export function platformForUrl(rawUrl: string): AdPlatform | null {
  let host: string
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    host = url.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  for (const platform of AD_PLATFORMS) {
    for (const allowed of AD_PLATFORM_HOSTS[platform]) {
      if (host === allowed || host.endsWith(`.${allowed}`)) return platform
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const AD_MAX_POSTS_PER_CAMPAIGN = 20
export const AD_MAX_CAMPAIGNS_PER_ADVERTISER = 25
export const AD_MAX_COMMENT_EXAMPLES = 12
export const AD_MAX_COMMENT_URL_CHARS = 2_000

/**
 * The attestation a user ticks before submitting evidence.
 *
 * One sentence, in the first person, naming the consequence. It is not there
 * to be a legal instrument — it is there so that when a sweep finds a forged
 * link, the enforcement points at something the person affirmatively did
 * rather than at a policy nobody read. Same role
 * `freebuff_bounty_submission.agreed_to_terms_at` plays.
 */
export const AD_EVIDENCE_ATTESTATION =
  'I confirm this is genuine proof of my own engagement. I understand it will be verified, and that falsified evidence will result in my account being banned.'
export const AD_MAX_DESCRIPTION_CHARS = 2_000
export const AD_MAX_COMMENT_GUIDANCE_CHARS = 2_000

/** How many distinct comment suggestions we generate for a user to pick from.
 *  Enough that two people engaging with the same post do not paste the same
 *  sentence; few enough that the choice is not itself work. */
export const AD_GENERATED_COMMENT_COUNT = 4

/**
 * Per-user daily ceiling on approved engagements.
 *
 * Not an anti-fraud control (the screenshot review is), but a supply one: a
 * campaign that funds 20 engagements a day should reach 20 people rather than
 * one person twenty times, or the advertiser is buying a single account's
 * opinion at scale. It is also what stops the Earn page becoming a job.
 */
export const AD_MAX_ENGAGEMENTS_PER_USER_PER_DAY = 12

/** A user may not engage with the same post twice, ever. Enforced by a unique
 *  index; this constant exists for the copy. */
export const AD_ONE_ENGAGEMENT_PER_POST_PER_USER = true

/** Minimum seconds between a post being opened and its evidence being
 *  accepted. Someone who "engaged" with a LinkedIn post four seconds after
 *  seeing it did not read it. Small enough to be invisible to anyone acting in
 *  good faith. */
export const AD_MIN_ENGAGEMENT_DWELL_SECONDS = 20

/**
 * How long a FLAGGED submission blocks the user from submitting again.
 *
 * Derived rather than stored: the block is "does this account have a flagged
 * row newer than this window", which needs no column, no cron and no cleanup,
 * and expires on its own if nobody ever looks at the queue. A stored
 * `blocked_until` would outlive the operator's attention, which is the failure
 * mode that turns a cooling-off period into a silent ban.
 *
 * A day, because that is long enough to stop somebody iterating against the
 * verifier and short enough that a false positive costs a real user one
 * evening rather than their account.
 */
export const AD_FLAG_BLOCK_HOURS = 24

export const AD_MAX_EVIDENCE_IMAGES = 4
export const AD_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const AD_ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

// ---------------------------------------------------------------------------
// Campaign lifecycle
// ---------------------------------------------------------------------------

/**
 * The campaign lifecycle. The order is the order a campaign moves through it.
 *
 *   draft → pending_review → paused (approved, unfunded) → active → paused …
 *                          ↘ rejected → (edit) → pending_review
 *
 * An approved campaign lands in `paused` rather than `active` on purpose: it
 * has no subscription yet, and a campaign that started serving before anyone
 * had paid is the one failure the whole review flow exists to prevent.
 */
export const AD_CAMPAIGN_STATUSES = [
  'draft',
  'pending_review',
  'rejected',
  'active',
  'paused',
  'ended',
] as const
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number]

/** Statuses an advertiser can still edit the posts of. A live campaign's posts
 *  are editable too — the edit does not re-open review, because the alternative
 *  is a campaign that stops delivering every time somebody fixes a typo. */
export const AD_EDITABLE_CAMPAIGN_STATUSES = [
  'draft',
  'rejected',
  'paused',
  'active',
] as const

/** User-facing label per status. `pending_review` and `rejected` are the two
 *  that need to say something an advertiser can act on. */
export const AD_CAMPAIGN_STATUS_LABELS: Record<AdCampaignStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  rejected: 'Changes needed',
  active: 'Live',
  paused: 'Paused',
  ended: 'Ended',
}

export const AD_ENGAGEMENT_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'skipped',
] as const
export type AdEngagementStatus = (typeof AD_ENGAGEMENT_STATUSES)[number]

/**
 * Marketing copy for the advertiser landing page, kept beside the numbers it
 * quotes so a price change cannot leave a stale claim on the page.
 *
 * The comparison figures are public rate-card ranges for developer-audience
 * campaigns, stated as ranges because that is what they are. Nothing here
 * asserts a competitor's exact price.
 */
export const AD_COMPARISON = {
  linkedinCpcUsd: [8, 14] as const,
  twitterCpcUsd: [1.5, 4] as const,
  /** What $10 buys here. Derived, so it cannot drift from the price. */
  engagementsPerTenDollars: engagementsForDailyBudget(1_000),
} as const
