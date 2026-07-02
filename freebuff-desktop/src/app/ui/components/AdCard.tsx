/**
 * Renders an `ad` part (core/parts.ts) — a sponsored card interspersed into the
 * transcript by the engine after a completed turn (like freebuff.com/web's
 * in-history ads, not the CLI's rotating slot). The part is persisted with its
 * message, so the card stays in place as the user scrolls back.
 *
 * Tracking is renderer-driven, proxied through the orchestrator (the bearer
 * lives there): the impression is recorded on the card's first mount — the
 * moment a human could actually see it, so headless queue-autorun turns never
 * bill one — deduped per impUrl for the renderer session (persisted cards
 * remount on tab switches). Clicks (including middle-click's auxclick, which
 * also navigates) record the click-through; navigation itself is the anchor's:
 * `target="_blank"` routes through the Electron shell's window-open handler to
 * the default browser, opening the provider's tracking redirect (`clickUrl`,
 * falling back to the landing `url`).
 */

import { useEffect } from 'react'

import { api } from '../lib/api'
import type { AdPart } from '../lib/types'

/** impUrls whose impression this renderer session already recorded. */
const impressionsFired = new Set<string>()

/** The advertiser's domain, shown as the destination hint under the CTA. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function AdCard({ part }: { part: AdPart }) {
  const { ad } = part
  const href = ad.clickUrl || ad.url
  const domain = domainOf(ad.url)

  const impUrl = ad.impUrl
  useEffect(() => {
    if (!impUrl || impressionsFired.has(impUrl)) return
    impressionsFired.add(impUrl)
    void api.recordAdImpression(impUrl)
  }, [impUrl])

  const recordClick = () => {
    if (impUrl) void api.recordAdClick(impUrl)
  }

  return (
    <a
      className="ad-card"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={recordClick}
      onAuxClick={(e) => {
        // Middle-click opens the link too but never fires onClick.
        if (e.button === 1) recordClick()
      }}
    >
      <div className="ad-card-head">
        {ad.favicon ? <img className="ad-favicon" src={ad.favicon} alt="" /> : null}
        <span className="ad-title">{ad.title}</span>
        <span className="ad-badge">Sponsored</span>
      </div>
      {ad.adText ? <div className="ad-text">{ad.adText}</div> : null}
      <div className="ad-foot">
        {ad.cta ? <span className="ad-cta">{ad.cta} →</span> : null}
        {domain ? <span className="ad-domain">{domain}</span> : null}
      </div>
    </a>
  )
}
