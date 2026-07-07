import { TextAttributes } from '@opentui/core'
import { safeOpen } from '../utils/open-url'
import React, { useState, useMemo, useEffect } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { AdResponse } from '../hooks/use-gravity-ad'

interface ChoiceAdBannerProps {
  ads: AdResponse[]
  onClick?: (ad: AdResponse) => void
  onImpression?: (ad: AdResponse) => void
}

export const AD_CARD_HEIGHT = 5 // border-top + 2 lines description + spacer + cta row + border-bottom
const MAX_DESC_LINES = 2
const MIN_CARD_WIDTH = 60 // Minimum width per ad card to remain readable

function truncateToLines(text: string, lineWidth: number, maxLines: number): string {
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

export function getAdDisplayLabel(
  ad: Pick<AdResponse, 'title' | 'url'>,
): { text: string; variant: 'domain' | 'title' } {
  const url = ad.url.trim()
  if (url) {
    return { text: extractDomain(url), variant: 'domain' }
  }

  return { text: ad.title.trim() || 'Sponsored', variant: 'title' }
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
  onClick?: (ad: AdResponse) => void
  onImpression?: (ad: AdResponse) => void
}> = ({ ad, width, onClick, onImpression }) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    onImpression?.(ad)
  }, [ad, onImpression])

  const ctaText = ad.cta || ad.title || 'Learn more'
  const label = getAdDisplayLabel(ad)
  const labelMaxWidth = Math.max(0, width - ctaText.length - 5)
  const labelText = truncateToWidth(label.text, labelMaxWidth)

  return (
    <Button
      onClick={() => {
        if (!ad.clickUrl) return
        onClick?.(ad)
        safeOpen(ad.clickUrl)
      }}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
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
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', height: MAX_DESC_LINES, overflow: 'hidden' }}>
        <text style={{ fg: theme.muted, flexShrink: 1 }}>
          {truncateToLines(ad.adText, width - 8, MAX_DESC_LINES)}
        </text>
        <text style={{ fg: theme.muted, flexShrink: 0 }}>{'  Ad'}</text>
      </box>
      <box style={{ flexGrow: 1 }} />
      {/* Bottom: CTA + domain */}
      <box style={{ flexDirection: 'row', columnGap: 1, alignItems: 'center', height: 1, overflow: 'hidden' }}>
        <text
          style={{
            fg: theme.name === 'light' ? '#ffffff' : theme.background,
            bg: isHovered ? theme.primary : theme.muted,
            attributes: TextAttributes.BOLD,
          }}
        >
          {` ${ctaText} `}
        </text>
        <text
          style={{
            fg: theme.muted,
            wrapMode: 'none',
            attributes:
              label.variant === 'domain'
                ? TextAttributes.UNDERLINE
                : TextAttributes.BOLD,
          }}
        >
          {labelText}
        </text>
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
      <AdCard ad={ad} width={terminalWidth - 2} onClick={onClick} onImpression={onImpression} />
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

  const widths = useMemo(() => columnWidths(visibleAds.length, colAvail), [visibleAds.length, colAvail])

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
