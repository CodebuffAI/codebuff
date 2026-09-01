import { FREEBUFF_WEB_URL_PROD } from './hosts'
import { FREEBUFF_SUBSCRIPTION_TIERS } from './freebuff-subscriptions'

/**
 * Copy for the Freebuff subscription promotion.
 *
 * TWO CONSUMERS, ONE CATALOG. {@link HOUSE_AD_VARIATIONS} is the creative set
 * the house CAMPAIGN is seeded from (`scripts/seed-house-subscription-campaign.ts`),
 * and {@link HOUSE_AD_CREATIVES} is the checked-in FLOOR -- the last-resort
 * fill when no campaign could serve at all. They are deliberately the same
 * strings: the floor is variation 0 of each surface, so the safety net always
 * reads like the product rather than like something written once and forgotten.
 *
 * THE FLOOR IS COPY, NOT INVENTORY. There is no campaign row, no budget, no
 * frequency cap and no targeting behind it, and that is deliberate: a house
 * fallback that can itself return nothing is not a fallback. The serving
 * mechanism lives in `@codebuff/internal/ad-serving/house-ad` and is required
 * to be total over every surface below.
 *
 * **This file is published.** `common` ships wholesale to the public mirror
 * (docs/public-repo-sync.md). That is fine here -- it is marketing copy and a
 * price we print on the pricing page anyway -- but do not reach for anything
 * server-owned when editing it.
 *
 * DEPLOY GOTCHA: a `common/`-only change does NOT redeploy `freebuff-web`
 * (Render treats its `rootDir: freebuff/web` as an auto-deploy path filter).
 * After editing copy here, check BOTH `web` and `freebuff-web` by commit
 * ancestry and trigger the one that skipped. Campaign creative edits are
 * database rows and need no deploy at all -- that is the point of running the
 * promotion as a campaign.
 */

/**
 * Surfaces the house ad must cover.
 *
 * Deliberately declared here rather than imported: `common` cannot depend on
 * `@codebuff/internal`, where `AD_SURFACES` lives. `assertHouseAdCoversEverySurface`
 * in the serving module pins the two together at compile time, so adding a
 * surface there breaks the build instead of silently leaving it uncovered.
 */
export type HouseAdSurface =
  | 'waiting_room'
  | 'freebuff_web_chat'
  | 'chat_assistant'
  | 'cli_chat'

/** Where every house ad sends the reader. */
export const HOUSE_AD_DESTINATION_URL = `${FREEBUFF_WEB_URL_PROD}/plans`

/**
 * The entry price, read from the subscription catalog rather than typed in.
 *
 * Copy that repeats a price drifts from the thing that charges it. `starter`
 * was resized on 2026-08-27 days before rollout; an ad hardcoding the old
 * number would have quietly advertised a price checkout would refuse.
 *
 * A price change also moves every string's LENGTH, which is why the width
 * budget below is asserted in a test rather than eyeballed once.
 */
const ENTRY_TIER = FREEBUFF_SUBSCRIPTION_TIERS[0]
const PRICE = `$${ENTRY_TIER?.priceUsd ?? 8}/mo`

/**
 * What the plan actually BUYS, read from the same catalog as the price.
 *
 * These are the only claims this promotion may make. A Freebuff subscription
 * grants SESSIONS -- it does not remove ads and it does not skip a queue.
 * Nothing on any serve path reads subscription status: `_post.ts`, the
 * Freebuff web route and the Desktop display route all serve a subscriber
 * exactly what they serve everybody else, and the `waiting_room` surface is
 * the CLI landing screen rather than an admission queue.
 *
 * The first version of this copy claimed both. Do not reintroduce either
 * without a code path that makes it true -- an ad that lies about the product
 * is worse than an empty slot, which is the only thing it is competing with.
 *
 * THE PLAN TOPS THE FREE POOL UP, IT DOES NOT REPLACE IT. `public-api.ts`
 * builds a subscriber's allowance as `plan.limit + freeLimit`, because the
 * free pool burns first and the plan is what is left after it. So the honest
 * unit is "N MORE a day", never "N a day" -- the bare number both understates
 * what is bought and describes it wrongly. That confusion has already produced
 * one shipped bug, where a picker header read 4 beside a ring reading 9.
 *
 * Interpolated for the same reason the price is: `dailySessions` was resized
 * on 2026-08-27, and copy that repeats a number drifts from the thing that
 * enforces it.
 */
const SESSIONS_PER_DAY = ENTRY_TIER?.dailySessions ?? 3
const SESSIONS_PER_MONTH = ENTRY_TIER?.monthlySessions ?? 50

export interface HouseAdCreative {
  title: string
  adText: string
  cta: string
  url: string
  favicon: string
  /** Only surfaces that render a card use this; inline text ads ignore it. */
  imageUrl?: string
}

/**
 * Our own mark, on BOTH mechanisms.
 *
 * Exported because the campaign needs it too, and cannot carry it any other
 * way: a creative's icon comes from `image_public_token`, which resolves to
 * `/api/ads/first-party/creative-image/{token}` and serves UPLOADED BYTES, so
 * a static path is not expressible there. Uploading is also not a workable
 * substitute -- the upload endpoint accepts only a campaign in `draft`, the
 * console refuses to edit a paused one at all ("Campaign is no longer
 * editable"), and the upload resets every creative on the campaign to
 * `pending_review`. Measured on 2026-08-28 against the live console: three of
 * four house campaigns could not be given a logo by any product path.
 *
 * The materializer falls back to this instead, which also means the promotion
 * looks the same whichever mechanism filled the slot.
 */
export const HOUSE_AD_FAVICON_URL = `${FREEBUFF_WEB_URL_PROD}/favicon/favicon-32x32.ico`

const FAVICON = HOUSE_AD_FAVICON_URL

/**
 * What the inline renderer actually gives a creative, in characters.
 *
 * Both numbers come from `getInlineAdLayout` in `common/src/ads/inline-ad-layout.ts`.
 * The adjacent test RECOMPUTES them from that function rather than trusting
 * these constants, so a layout change fails the build instead of silently
 * cutting our own copy.
 *
 * - TITLE at the RENDERER FLOOR (`MIN_INLINE_AD_WIDTH` = 20): content is
 *   `20 - 4` for border and padding, less the `Ad` disclosure and its gap,
 *   leaving 12. The floor is a renderer fact, deliberately NOT
 *   `PLACEMENT_PREVIEW_WIDTHS` — the console stopped previewing 20 columns
 *   (nobody runs one), but a real terminal can still be that narrow, and a
 *   cut title reads as a different product rather than a shortened claim.
 * - DESCRIPTION at width 48: content is `48 - 4`, less the destination label
 *   (`freebuff.com`), its gap and the link arrow, leaving 28.
 *
 * THE DESCRIPTION BUDGET IS DELIBERATELY NOT THE FLOOR. At 20 columns the
 * description gets 16 characters, which no sentence from any advertiser
 * survives -- holding our own copy to it would buy a promotion nobody can
 * read at the widths people actually use. So 20 is accepted as a degraded
 * render for the description and enforced for the TITLE only.
 */
export const HOUSE_AD_TITLE_BUDGET = 12
export const HOUSE_AD_TEXT_BUDGET = 28

const inline = (title: string, adText: string): HouseAdCreative => ({
  title,
  adText,
  cta: 'See plans',
  url: HOUSE_AD_DESTINATION_URL,
  favicon: FAVICON,
})

/**
 * Every creative the promotion runs, per surface.
 *
 * MORE THAN ONE ON PURPOSE. The CTR creative bias picks a winner out of what a
 * campaign offers it, and a campaign with one creative gives it nothing to
 * choose between -- the promotion would then be exactly as good as whichever
 * line happened to be written first. These deliberately argue different things
 * (the price, the queue, the model list, the ads themselves) so the measurement
 * is between ANGLES rather than between synonyms.
 *
 * Variation 0 is the safest of each set and is what the floor serves: it makes
 * the plainest claim, so it is the one that stays true if the others age.
 *
 * Repetition is handled by rotating these, never by capping the campaign -- a
 * cap means "show the promotion three times, then go back to an empty pane",
 * which is the behaviour this whole feature exists to remove.
 */
export const HOUSE_AD_VARIATIONS: Readonly<
  Record<HouseAdSurface, readonly HouseAdCreative[]>
> = Object.freeze({
  // The transcript. Width-constrained and read mid-task, so the claim has to
  // land in one glance.
  cli_chat: Object.freeze([
    inline('Freebuff Pro', `${SESSIONS_PER_DAY} more a day. ${PRICE}`),
    inline('Freebuff Pro', `${SESSIONS_PER_MONTH} more a month. ${PRICE}`),
    inline('Freebuff Pro', `Every model, +${SESSIONS_PER_DAY} a day.`),
    inline('Need more?', `Pro starts at ${PRICE}.`),
  ]),
  // The CLI landing screen -- where somebody is choosing a model, and where
  // running out of sessions is the thing actually on their mind.
  waiting_room: Object.freeze([
    inline('Freebuff Pro', `${SESSIONS_PER_DAY} more a day. ${PRICE}`),
    inline('Out of runs?', `Pro adds ${SESSIONS_PER_DAY} a day. ${PRICE}`),
    inline('Freebuff Pro', `+${SESSIONS_PER_MONTH} a month, every model.`),
    inline('Need more?', `Pro starts at ${PRICE}.`),
  ]),
  freebuff_web_chat: Object.freeze([
    inline('Freebuff Pro', `${SESSIONS_PER_DAY} more a day. ${PRICE}`),
    inline('Freebuff Pro', `${SESSIONS_PER_MONTH} more a month. ${PRICE}`),
    inline('Freebuff Pro', `Every model, +${SESSIONS_PER_DAY} a day.`),
    inline('Need more?', `Pro starts at ${PRICE}.`),
  ]),
  chat_assistant: Object.freeze([
    inline('Freebuff Pro', `${SESSIONS_PER_DAY} more a day. ${PRICE}`),
    inline('Freebuff Pro', `${SESSIONS_PER_MONTH} more a month. ${PRICE}`),
    inline('Freebuff Pro', `Every model, +${SESSIONS_PER_DAY} a day.`),
    inline('Need more?', `Pro starts at ${PRICE}.`),
  ]),
})

/**
 * The floor's creative for each surface: variation 0, the safest of the set.
 *
 * Single and deterministic on purpose. This is the last thing between a reader
 * and an empty pane, so it does no picking, reads no config and cannot fail --
 * rotation and measurement belong to the campaign, which is allowed to have an
 * off day.
 */
export const HOUSE_AD_CREATIVES: Readonly<
  Record<HouseAdSurface, HouseAdCreative>
> = Object.freeze({
  cli_chat: HOUSE_AD_VARIATIONS.cli_chat[0]!,
  waiting_room: HOUSE_AD_VARIATIONS.waiting_room[0]!,
  freebuff_web_chat: HOUSE_AD_VARIATIONS.freebuff_web_chat[0]!,
  chat_assistant: HOUSE_AD_VARIATIONS.chat_assistant[0]!,
})

/**
 * The Desktop new-tab display slot renders a card rather than an inline text
 * ad, so it is the one place an image earns its keep -- and the one place the
 * inline width budget above does not apply.
 */
export const HOUSE_AD_DISPLAY_VARIATIONS: readonly HouseAdCreative[] =
  Object.freeze([
    {
      title: 'Freebuff Pro',
      adText: `${SESSIONS_PER_DAY} more sessions a day, on every model, from ${PRICE}.`,
      cta: 'See plans',
      url: HOUSE_AD_DESTINATION_URL,
      favicon: FAVICON,
      imageUrl: `${FREEBUFF_WEB_URL_PROD}/opengraph-image.png`,
    },
    {
      title: 'Out of sessions?',
      adText: `Freebuff Pro adds ${SESSIONS_PER_DAY} a day, from ${PRICE}.`,
      cta: 'See plans',
      url: HOUSE_AD_DESTINATION_URL,
      favicon: FAVICON,
      imageUrl: `${FREEBUFF_WEB_URL_PROD}/opengraph-image.png`,
    },
    {
      title: 'More runs, every model',
      adText: `${SESSIONS_PER_MONTH} more sessions a month, from ${PRICE}.`,
      cta: 'See plans',
      url: HOUSE_AD_DESTINATION_URL,
      favicon: FAVICON,
      imageUrl: `${FREEBUFF_WEB_URL_PROD}/opengraph-image.png`,
    },
  ])

export const HOUSE_AD_DISPLAY_CREATIVE: HouseAdCreative =
  HOUSE_AD_DISPLAY_VARIATIONS[0]!
