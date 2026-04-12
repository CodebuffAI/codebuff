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
  onImpression?: (impUrl: string) => void
}

const CARD_HEIGHT = 5 // border-top + 2 lines description + spacer + cta row + border-bottom
const MAX_DESC_LINES = 2
const MIN_CARD_WIDTH = 60 // Minimum width per ad card to remain readable

function truncateToLines(text: string, lineWidth: number, maxLines: number): string {
  if (lineWidth <= 0) return text
  const maxChars = lineWidth * maxLines
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

const extractDomain = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
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

export const ChoiceAdBanner: React.FC<ChoiceAdBannerProps> = ({ ads, onImpression }) => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Available width for cards (terminal minus left/right margin of 1 each)
  const colAvail = terminalWidth - 2

  // Only show as many ads as fit with a healthy minimum width; hide the rest
  const maxVisible = Math.max(1, Math.floor(colAvail / MIN_CARD_WIDTH))
  const visibleAds = useMemo(
    () => (ads.length > maxVisible ? ads.slice(0, maxVisible) : ads),
    [ads, maxVisible],
  )

  const widths = useMemo(() => columnWidths(visibleAds.length, colAvail), [visibleAds.length, colAvail])

  // Fire impressions only for visible ads
  useEffect(() => {
    if (onImpression) {
      for (const ad of visibleAds) {
        onImpression(ad.impUrl)
      }
    }
  }, [visibleAds, onImpression])

  const hoverBorderColor = theme.primary

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
        {visibleAds.map((ad, i) => {
          const isHovered = hoveredIndex === i
          const domain = extractDomain(ad.url)
          const ctaText = ad.cta || ad.title || 'Learn more'

          return (
            <Button
              key={ad.impUrl}
              onClick={() => {
                if (ad.clickUrl) safeOpen(ad.clickUrl)
              }}
              onMouseOver={() => setHoveredIndex(i)}
              onMouseOut={() => setHoveredIndex(null)}
              style={{
                width: widths[i],
                height: CARD_HEIGHT,
                borderStyle: 'single',
                borderColor: isHovered ? hoverBorderColor : theme.muted,
                customBorderChars: BORDER_CHARS,
                paddingLeft: 1,
                paddingRight: 1,
                flexDirection: 'column',

              }}
            >
              <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', height: MAX_DESC_LINES, overflow: 'hidden' }}>
                <text style={{ fg: theme.muted, flexShrink: 1 }}>
                  {truncateToLines(ad.adText, widths[i] - 8, MAX_DESC_LINES)}
                </text>
                <text style={{ fg: theme.muted, flexShrink: 0 }}>{'  Ad'}</text>
              </box>
              <box style={{ flexGrow: 1 }} />
              {/* Bottom: CTA + domain */}
              <box style={{ flexDirection: 'row', columnGap: 1, alignItems: 'center' }}>
                <text
                  style={{
                    fg: theme.name === 'light' ? '#ffffff' : theme.background,
                    bg: isHovered ? theme.primary : theme.muted,
                    attributes: TextAttributes.BOLD,
                  }}
                >
                  {` ${ctaText} `}
                </text>
                <text style={{ fg: theme.muted, attributes: TextAttributes.UNDERLINE }}>
                  {domain}
                </text>

              </box>
            </Button>
          )
        })}

      </box>

    </box>
  )
}
