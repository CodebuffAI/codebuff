/**
 * The Earn page: where every client points at it, and the one line they all
 * use to do so.
 *
 * Lived in `freebuff-levels.ts` until 2026-09-07, when Trust and the Levels
 * ladder were retired. The page outlived the currency it used to pay in, so
 * its constants moved here rather than dying with it.
 *
 * The unit is a literal rather than an import: `freebuff-freebucks.ts`
 * carries the price table and is export-excluded, this module is read by the
 * published CLI, and a public file importing an excluded one fails the export
 * leak check. A reward pays Freebucks into the wallet, but users read the
 * wallet in hours (`util/freebuff-hours.ts`, 2026-10-14), so the line says hours.
 */
const LABEL = 'hours'

/**
 * The one line every client shows to point at the Earn page.
 *
 * Shared because the prompt has to be identical in the CLI, Desktop and the
 * browser: it is the same offer, and three surfaces phrasing it three ways is
 * how a user concludes they are three different programs. It used to promise
 * "more daily sessions", which was what Trust bought; a verified engagement
 * now pays straight into the wallet, so it says so.
 */
export const FREEBUFF_EARN_PROMPT = `Earn ${LABEL} · engage with a promoted post`

/** Shorter form, for a row that already has a balance beside it. */
export const FREEBUFF_EARN_PROMPT_SHORT = `Earn ${LABEL}`

/**
 * Relative to the Freebuff web app.
 *
 * The `trust` slug is historical and deliberately unchanged: every released
 * CLI and Desktop binary holds this link, and the tab it names is the
 * engagement feed, which still pays — in Freebucks now.
 */
export const FREEBUFF_EARN_PATH = '/earn/trust'
