/**
 * Third-party measurement attached by the demand partners funding an Imprezia
 * ad, delivered from the end user's device.
 *
 * Delivering it is not optional. These pixels and frames belong to the
 * advertiser's own measurement vendor, not to Imprezia: an ad whose trackers
 * never fire is one the advertiser never counts as delivered, however
 * correctly we report it on our own beacon.
 *
 * This has to run on the END USER'S device. Firing these server-side would
 * carry a datacenter IP and a server UA and be discounted as invalid traffic,
 * which is the same as not delivering them at all.
 *
 * It lives in `common` because two surfaces deliver it and both are counted
 * against the same publisher account: the web chat renderer and the Desktop
 * renderer (Electron is Chromium, so `Image` and `<iframe>` behave exactly as
 * they do in the browser). The CLI is deliberately NOT a caller -- a terminal
 * can neither load an image nor render a frame.
 *
 * Everything here is fire-and-forget and swallows its own errors; nothing in
 * this file may surface to the user or reject into a render path.
 */

import type { ImpreziaTrackers } from './imprezia-ad'

/** Tracker moments already delivered, keyed `${requestId}:${moment}`. */
const deliveredTrackers = new Set<string>()

/** Hygiene on a long-lived page: drop the frame once it has loaded. */
const TRACKER_FRAME_CLEANUP_MS = 3_000

/**
 * Fire a plain GET for each tracker URL. An `Image` pixel needs no CORS
 * handling, which matters because these are arbitrary demand-partner
 * endpoints we cannot assume send CORS headers.
 */
function firePixels(urls: string[]): void {
  if (typeof Image === 'undefined') return
  for (const url of urls) {
    try {
      new Image().src = url
    } catch {
      // A malformed URL from the demand partner must not break the others.
    }
  }
}

/**
 * Embed a tracker frame. These MUST load as a document — the pixels inside
 * only run when a browser renders it, so fetching the URL delivers nothing.
 * Frames are one-shot: a later load returns an empty document, so a re-render
 * cannot double-count.
 */
function embedTrackerFrame(src: string): void {
  if (typeof document === 'undefined') return
  try {
    const frame = document.createElement('iframe')
    frame.src = src
    frame.width = '1'
    frame.height = '1'
    frame.style.display = 'none'
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.addEventListener('load', () => {
      setTimeout(() => frame.remove(), TRACKER_FRAME_CLEANUP_MS)
    })
    document.body.appendChild(frame)
  } catch {
    // Never let measurement break the page.
  }
}

/**
 * Deliver one measurement moment.
 *
 * Measurement arrives in exactly one of two channels per moment, so the
 * presence check on the frame URL both picks correctly and rules out
 * double-counting. `trackers` is absent entirely when the demand carries no
 * measurement, which needs no handling.
 */
export function deliverTrackers(params: {
  requestId: string
  trackers: ImpreziaTrackers | undefined
  moment: 'insertion' | 'mrc50'
}): void {
  const { requestId, trackers, moment } = params
  if (!trackers) return

  const key = `${requestId}:${moment}`
  if (deliveredTrackers.has(key)) return
  deliveredTrackers.add(key)

  const frameUrl =
    moment === 'insertion'
      ? trackers.impressionFrameUrl
      : trackers.viewabilityFrameUrl
  const urls = moment === 'insertion' ? trackers.impression : trackers.mrc50

  if (frameUrl) {
    embedTrackerFrame(frameUrl)
    return
  }
  // Treat the array as opaque — it may end with an Imprezia-origin URL that
  // verifies delivery, which is exactly as required as the partner's own.
  firePixels(urls ?? [])
}
