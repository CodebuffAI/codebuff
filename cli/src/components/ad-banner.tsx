import { TextAttributes } from '@opentui/core'
import {
  INLINE_AD_DISCLOSURE,
  INLINE_AD_GAP,
  INLINE_AD_LINK_SUFFIX,
  MAX_DESC_LINES,
  getAdDisplayLabel,
  getInlineAdLayout,
  truncateToLines,
  truncateToWidth,
} from '@codebuff/common/ads/inline-ad-layout'
import { visibleWaitingRoomPlacementIds } from '@codebuff/common/ads/waiting-room-placements'
import { safeOpen } from '../utils/open-url'
import React, { useState, useMemo, useEffect } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS, INVERTED_CTA_FG } from '../utils/ui-constants'

import type { AdResponse } from '../hooks/use-gravity-ad'

interface ChoiceAdBannerProps {
  ads: AdResponse[]
  placementIds?: readonly string[]
  onClick?: (ad: AdResponse) => void
  onImpression?: (ad: AdResponse) => void
}

// border-top + 2 copy rows + cta row + border-bottom. The two copy rows are
// headline + 1 description line, or 2 description lines when the ad has no
// headline — see getCardAdLayout. Fixed either way, because the landing screen
// subtracts this from the model picker's height budget.
export const AD_CARD_HEIGHT = 5
export const INLINE_AD_CARD_HEIGHT = 4 // border-top + header row + detail row + border-bottom

// Layout lives in `common` so the advertiser campaign builder's creative
// preview fits copy exactly the way this renderer does. Re-exported here
// because this module was its original home.
export {
  extractDomain,
  getAdDisplayLabel,
  getInlineAdLayout,
} from '@codebuff/common/ads/inline-ad-layout'

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
  placementIds,
  onClick,
  onImpression,
}) => {
  const { terminalWidth } = useTerminalDimensions()

  // Available width for cards (terminal minus left/right margin of 1 each)
  const colAvail = terminalWidth - 2

  // Only show as many ads as fit with a healthy minimum width; hide the rest
  const maxVisible =
    placementIds?.length ?? visibleWaitingRoomPlacementIds(terminalWidth).length
  const visibleAds = useMemo(() => {
    const requested = placementIds?.length
      ? orderedRequestedAds(ads, placementIds)
      : ads
    return requested.slice(0, maxVisible)
  }, [ads, maxVisible, placementIds])

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

/** Preserve canonical request order and never mount a duplicate slot response. */
export function orderedRequestedAds(
  ads: AdResponse[],
  placementIds: readonly string[],
): AdResponse[] {
  return placementIds.flatMap((placementId) => {
    const ad = ads.find((candidate) => candidate.placementId === placementId)
    return ad ? [ad] : []
  })
}
