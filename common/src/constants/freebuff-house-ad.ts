import { FREEBUFF_WEB_URL_PROD } from './hosts'
import { FREEBUFF_SUBSCRIPTION_TIERS } from './freebuff-subscriptions'

/**
 * Copy for the Freebuff subscription house ad -- the last-resort fill when no
 * paid or first-party campaign can serve a slot.
 *
 * THIS IS COPY, NOT INVENTORY. There is no campaign row, no budget, no
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
 * ancestry and trigger the one that skipped.
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
 */
const ENTRY_PRICE_USD = FREEBUFF_SUBSCRIPTION_TIERS[0]?.priceUsd ?? 8

export interface HouseAdCreative {
  title: string
  adText: string
  cta: string
  url: string
  favicon: string
  /** Only surfaces that render a card use this; inline text ads ignore it. */
  imageUrl?: string
}

const FAVICON = `${FREEBUFF_WEB_URL_PROD}/favicon/favicon-32x32.ico`

/**
 * One creative per surface.
 *
 * The terminal surfaces are width-constrained in a way the web ones are not:
 * the transcript renderer floors at 20 columns and drops the destination
 * domain entirely below 48 (see `PLACEMENT_PREVIEW_WIDTHS` in
 * `freebuff-placements.ts`), so `title` and `adText` stay short enough to
 * survive a narrow pane rather than being cut mid-clause.
 */
export const HOUSE_AD_CREATIVES: Readonly<
  Record<HouseAdSurface, HouseAdCreative>
> = Object.freeze({
  cli_chat: {
    title: 'Freebuff Pro',
    adText: `Skip the queue and the ads, from $${ENTRY_PRICE_USD}/mo.`,
    cta: 'See plans',
    url: HOUSE_AD_DESTINATION_URL,
    favicon: FAVICON,
  },
  waiting_room: {
    title: 'Tired of waiting?',
    adText: `Subscribers get daily sessions that start right away, from $${ENTRY_PRICE_USD}/mo.`,
    cta: 'See plans',
    url: HOUSE_AD_DESTINATION_URL,
    favicon: FAVICON,
  },
  freebuff_web_chat: {
    title: 'Freebuff Pro',
    adText: `Daily sessions on every model, no queue, no ads. From $${ENTRY_PRICE_USD}/mo.`,
    cta: 'See plans',
    url: HOUSE_AD_DESTINATION_URL,
    favicon: FAVICON,
  },
  chat_assistant: {
    title: 'Freebuff Pro',
    adText: `Daily sessions on every model, no queue, no ads. From $${ENTRY_PRICE_USD}/mo.`,
    cta: 'See plans',
    url: HOUSE_AD_DESTINATION_URL,
    favicon: FAVICON,
  },
})

/**
 * The Desktop new-tab slot renders a card rather than an inline text ad, so it
 * is the one place an image earns its keep.
 */
export const HOUSE_AD_DISPLAY_CREATIVE: HouseAdCreative = Object.freeze({
  title: 'Freebuff Pro',
  adText: `Daily sessions on every model, no queue, and no ads. From $${ENTRY_PRICE_USD}/mo.`,
  cta: 'See plans',
  url: HOUSE_AD_DESTINATION_URL,
  favicon: FAVICON,
  imageUrl: `${FREEBUFF_WEB_URL_PROD}/opengraph-image.png`,
})
