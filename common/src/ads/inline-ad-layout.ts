/**
 * Inline ad layout — the single implementation of how an ad is fitted into a
 * fixed character width.
 *
 * This lives in `common` rather than in the CLI because two surfaces have to
 * agree on it exactly: the CLI, which renders the ad, and the advertiser
 * campaign builder in `freebuff/web`, whose creative preview has to show an
 * advertiser what their copy will actually look like at 20, 48 and 60 columns.
 *
 * A CSS approximation of this in the web preview would be wrong. Note that
 * {@link truncateToWidth} measures with `String.length`, which counts UTF-16
 * code units rather than display columns — so emoji and CJK text truncate
 * differently here than a proportional-font preview would suggest. That
 * behaviour is deliberate to document rather than silently diverge from: the
 * preview must reproduce what the terminal does, including where it is wrong.
 */

/** Widths where inline ad layout actually changes behaviour. */
export const MIN_INLINE_WIDTH_WITH_DESTINATION = 48
export const MAX_DESC_LINES = 2
export const INLINE_AD_DISCLOSURE = 'Ad'
export const INLINE_AD_GAP = 2
export const INLINE_AD_LINK_SUFFIX = ' ↗'

/**
 * The fields of an ad that layout depends on. Structural rather than the CLI's
 * `AdResponse` so `common` does not depend on the CLI.
 */
export interface InlineAdLayoutInput {
  adText: string
  title: string
  url: string
}

export function truncateToLines(
  text: string,
  lineWidth: number,
  maxLines: number,
): string {
  if (lineWidth <= 0) return text
  const maxChars = lineWidth * maxLines
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text
  return text.slice(0, width - 1) + '…'
}

export const extractDomain = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * What the ad shows as its destination. Carbon exposes no destination URL, so
 * those ads fall back to their title — which is why a Carbon ad renders a
 * headline where a Gravity ad renders `neon.tech`.
 */
export function getAdDisplayLabel(
  ad: Pick<InlineAdLayoutInput, 'title' | 'url'>,
): {
  text: string
  variant: 'domain' | 'title'
} {
  const url = ad.url.trim()
  if (url) {
    return { text: extractDomain(url), variant: 'domain' }
  }

  return { text: ad.title.trim() || 'Sponsored', variant: 'title' }
}

/**
 * Fit an ad into `width` columns.
 *
 * Below {@link MIN_INLINE_WIDTH_WITH_DESTINATION} the destination label is
 * dropped entirely — the advertiser's domain is not shown at all. That is the
 * single most surprising thing about narrow terminals and the reason the
 * builder previews 20 columns at all.
 */
export function getInlineAdLayout(
  ad: InlineAdLayoutInput,
  width: number,
): { title: string; description: string; label: string } {
  const contentWidth = Math.max(0, width - 4) // border + horizontal padding
  const displayLabel = getAdDisplayLabel(ad)
  const headerTrailingWidth = INLINE_AD_GAP + INLINE_AD_DISCLOSURE.length
  const titleWidth = Math.max(0, contentWidth - headerTrailingWidth)
  const destinationLabel =
    width >= MIN_INLINE_WIDTH_WITH_DESTINATION &&
    displayLabel.variant === 'domain'
      ? displayLabel.text
      : ''
  const maxLabelWidth = Math.max(0, Math.min(24, Math.floor(contentWidth / 3)))
  const label = truncateToWidth(destinationLabel, maxLabelWidth)
  const trailingWidth = label
    ? INLINE_AD_GAP + label.length + INLINE_AD_LINK_SUFFIX.length
    : 0
  const descriptionWidth = Math.max(0, contentWidth - trailingWidth)

  return {
    title: truncateToWidth(ad.title.trim() || displayLabel.text, titleWidth),
    description: truncateToWidth(ad.adText.trim(), descriptionWidth),
    label,
  }
}
