import { TextAttributes } from '@opentui/core'
import { safeOpen } from '../utils/open-url'
import React, { useState, useMemo, useEffect } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS, INVERTED_CTA_FG } from '../utils/ui-constants'

import type { AdResponse } from '../hooks/use-gravity-ad'

interface ChoiceAdBannerProps {
  ads: AdResponse[]
  onClick?: (ad: AdResponse) => void
  onImpression?: (ad: AdResponse) => void
}

// border-top + 2 copy rows + cta row + border-bottom. The two copy rows are
// headline + 1 description line, or 2 description lines when the ad has no
// headline — see getCardAdLayout. Fixed either way, because the landing screen
// subtracts this from the model picker's height budget.
export const AD_CARD_HEIGHT = 5
export const INLINE_AD_CARD_HEIGHT = 4 // border-top + header row + detail row + border-bottom
const MAX_DESC_LINES = 2
const MIN_CARD_WIDTH = 60 // Minimum width per ad card to remain readable
const MIN_INLINE_WIDTH_WITH_DESTINATION = 48
const INLINE_AD_DISCLOSURE = 'Ad'
const INLINE_AD_GAP = 2
const INLINE_AD_LINK_SUFFIX = ' ↗'

function truncateToLines(
  text: string,
  lineWidth: number,
  maxLines: number,
): string {
  if (lineWidth <= 0) return text
  const maxChars = lineWidth * maxLines
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

function truncateToWidth(text: string, width: number): string {
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

export function getAdDisplayLabel(ad: Pick<AdResponse, 'title' | 'url'>): {
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
 * Card layout: the five-row bordered ad the landing screen draws, and the only
 * format a first-party placements campaign can serve on.
 *
 * The headline is `ad.title`, and until now it rendered nowhere. `ctaText` read
 * `ad.cta || ad.title`, so a creative carrying its own CTA never reached the
 * title, and `getAdDisplayLabel` returns the domain whenever a URL is set — so
 * the exact creative the advertiser console asks for (headline + body + CTA +
 * landing URL) dropped its headline on every impression. An advertiser filled
 * in the most prominent field on the form and it appeared on nothing.
 *
 * The height does not change. The headline takes the row the body gives up,
 * because {@link AD_CARD_HEIGHT} is subtracted from the model picker's budget
 * in `freebuff-landing-screen.tsx` — growing the card costs the picker a row on
 * every terminal, which is not a trade an ad gets to make. Ads with no title
 * keep both body lines, so nothing regresses for creative that never had one.
 */
export function getCardAdLayout(
  ad: Pick<AdResponse, 'adText' | 'title' | 'cta' | 'url'>,
  width: number,
): {
  headline: string
  description: string
  descriptionLines: number
  ctaText: string
  labelText: string
  labelVariant: 'domain' | 'title'
} {
  // Every field is defaulted before it is read. `AdResponse` types these as
  // required strings, but nothing enforces that at runtime: the Gravity
  // provider casts `response.json()` rather than parsing it and `normalize()`
  // copies `cta: raw.cta` with no default, while the Carbon provider beside it
  // writes `cta: raw.callToAction ?? 'Learn more'` — so a missing field is a
  // case this codebase already expects from a network. A throw here is a throw
  // inside AdCard's render on the landing screen, and `error-boundary.tsx` is a
  // passthrough that does not catch render errors.
  const title = (ad.title ?? '').trim()
  const cta = (ad.cta ?? '').trim()
  const adText = ad.adText ?? ''
  const url = ad.url ?? ''

  // Interior width less the padding and the ' Ad' disclosure, matching what
  // the description has always been given.
  const copyWidth = Math.max(0, width - 8)
  const headline = truncateToWidth(title, copyWidth)
  const descriptionLines = headline ? 1 : MAX_DESC_LINES
  // The title is no longer a CTA fallback: it has a row of its own, and using
  // it here too printed the same string twice on a five-row card.
  const ctaText = cta || 'Learn more'
  // Called with the defaulted fields, not `ad`: it reads `ad.url.trim()`
  // directly and would throw on the same malformed payload.
  const label = getAdDisplayLabel({ title, url })
  // Without a URL the label falls back to the title, which is now drawn one row
  // above. Same string, twice, for the same reason.
  const showLabel = label.variant === 'domain' || !headline

  return {
    headline,
    description: truncateToLines(adText, copyWidth, descriptionLines),
    descriptionLines,
    ctaText,
    labelText: showLabel
      ? truncateToWidth(label.text, Math.max(0, width - ctaText.length - 5))
      : '',
    labelVariant: label.variant,
  }
}

export function getInlineAdLayout(
  ad: Pick<AdResponse, 'adText' | 'title' | 'url'>,
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

/**
 * Calculate evenly distributed column widths that sum exactly to availableWidth.
 * Distributes remainder pixels across the first N columns so there's no gap.
 */
function columnWidths(count: number, availableWidth: number): number[] {
  const base = Math.floor(availableWidth / count)
  const remainder = availableWidth - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * A single ad card: full-width above the input ({@link SingleAdBanner}),
 * content-width when interspersed inside an assistant response
 * (BlocksRenderer), and in a row of columns on the landing screen
 * ({@link ChoiceAdBanner}). Manages its own hover state and
 * fires its impression on mount and on ad rotation (deduped per impUrl in the
 * ads hook, so remounts and scroll churn don't double-count).
 */
export const AdCard: React.FC<{
  ad: AdResponse
  width: number
  variant?: 'card' | 'inline'
  onClick?: (ad: AdResponse) => void
  onImpression?: (ad: AdResponse) => void
}> = ({ ad, width, variant = 'card', onClick, onImpression }) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    onImpression?.(ad)
  }, [ad, onImpression])

  const buttonProps = {
    onClick: () => {
      if (!ad.clickUrl) return
      onClick?.(ad)
      safeOpen(ad.clickUrl)
    },
    onMouseOver: () => setIsHovered(true),
    onMouseOut: () => setIsHovered(false),
  }

  if (variant === 'inline') {
    const inlineLayout = getInlineAdLayout(ad, width)
    const accentColor = isHovered ? theme.primary : theme.muted
    return (
      <Button
        {...buttonProps}
        style={{
          width,
          height: INLINE_AD_CARD_HEIGHT,
          borderStyle: 'single',
          borderColor: accentColor,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <box
          style={{
            width: '100%',
            height: 1,
            flexDirection: 'row',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <text
            style={{
              fg: isHovered ? theme.primary : theme.foreground,
              flexShrink: 1,
              wrapMode: 'none',
            }}
            attributes={TextAttributes.BOLD}
          >
            {inlineLayout.title}
          </text>
          <text style={{ fg: theme.muted, flexShrink: 0, wrapMode: 'none' }}>
            {INLINE_AD_DISCLOSURE}
          </text>
        </box>
        <box
          style={{
            width: '100%',
            height: 1,
            flexDirection: 'row',
            justifyContent: 'space-between',
            columnGap: INLINE_AD_GAP,
            overflow: 'hidden',
          }}
        >
          <text style={{ fg: theme.muted, flexShrink: 1, wrapMode: 'none' }}>
            {inlineLayout.description}
          </text>
          {inlineLayout.label && (
            <text
              style={{
                fg: accentColor,
                flexShrink: 0,
                wrapMode: 'none',
              }}
              attributes={TextAttributes.UNDERLINE}
            >
              {inlineLayout.label + INLINE_AD_LINK_SUFFIX}
            </text>
          )}
        </box>
      </Button>
    )
  }

  const card = getCardAdLayout(ad, width)

  return (
    <Button
      {...buttonProps}
      style={{
        width,
        height: AD_CARD_HEIGHT,
        borderStyle: 'single',
        borderColor: isHovered ? theme.primary : theme.muted,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {/* The disclosure rides whichever row is first, so it is never below the
          fold of a card whose body has shrunk to one line. */}
      {card.headline ? (
        <box
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            height: 1,
            overflow: 'hidden',
          }}
        >
          <text
            style={{
              fg: isHovered ? theme.primary : theme.foreground,
              flexShrink: 1,
              wrapMode: 'none',
            }}
            attributes={TextAttributes.BOLD}
          >
            {card.headline}
          </text>
          <text style={{ fg: theme.muted, flexShrink: 0 }}>{'  Ad'}</text>
        </box>
      ) : null}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          height: card.descriptionLines,
          overflow: 'hidden',
        }}
      >
        <text style={{ fg: theme.muted, flexShrink: 1 }}>
          {card.description}
        </text>
        {card.headline ? null : (
          <text style={{ fg: theme.muted, flexShrink: 0 }}>{'  Ad'}</text>
        )}
      </box>
      <box style={{ flexGrow: 1 }} />
      {/* Bottom: CTA + domain */}
      <box
        style={{
          flexDirection: 'row',
          columnGap: 1,
          alignItems: 'center',
          height: 1,
          overflow: 'hidden',
        }}
      >
        <text
          style={{
            fg: INVERTED_CTA_FG,
            bg: isHovered ? theme.primary : theme.muted,
            attributes: TextAttributes.BOLD,
          }}
        >
          {` ${card.ctaText} `}
        </text>
        {card.labelText ? (
          <text
            style={{
              fg: theme.muted,
              wrapMode: 'none',
              attributes:
                card.labelVariant === 'domain'
                  ? TextAttributes.UNDERLINE
                  : TextAttributes.BOLD,
            }}
          >
            {card.labelText}
          </text>
        ) : null}
      </box>
    </Button>
  )
}

/**
 * The rotating ad pinned above the chat input box. Rerenders (and fires a new
 * impression) each time the hook rotates `ads[0]`.
 */
export const SingleAdBanner: React.FC<{
  ad: AdResponse
  onClick?: (ad: AdResponse) => void
  onImpression?: (ad: AdResponse) => void
}> = ({ ad, onClick, onImpression }) => {
  const { terminalWidth } = useTerminalDimensions()

  return (
    <box style={{ marginLeft: 1, marginRight: 1 }}>
      <AdCard
        ad={ad}
        width={terminalWidth - 2}
        onClick={onClick}
        onImpression={onImpression}
      />
    </box>
  )
}

/**
 * Up to four ads shown in a row. Still used by the freebuff landing screen,
 * which intentionally fills the space with multiple ads.
 */
export const ChoiceAdBanner: React.FC<ChoiceAdBannerProps> = ({
  ads,
  onClick,
  onImpression,
}) => {
  const { terminalWidth } = useTerminalDimensions()

  // Available width for cards (terminal minus left/right margin of 1 each)
  const colAvail = terminalWidth - 2

  // Only show as many ads as fit with a healthy minimum width; hide the rest
  const maxVisible = Math.max(1, Math.floor(colAvail / MIN_CARD_WIDTH))
  const visibleAds = useMemo(
    () => (ads.length > maxVisible ? ads.slice(0, maxVisible) : ads),
    [ads, maxVisible],
  )

  const widths = useMemo(
    () => columnWidths(visibleAds.length, colAvail),
    [visibleAds.length, colAvail],
  )

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Card columns */}
      <box
        style={{
          marginLeft: 1,
          marginRight: 1,
          flexDirection: 'row',
        }}
      >
        {visibleAds.map((ad, i) => (
          <AdCard
            key={ad.impUrl}
            ad={ad}
            width={widths[i]}
            onClick={onClick}
            onImpression={onImpression}
          />
        ))}
      </box>
    </box>
  )
}
