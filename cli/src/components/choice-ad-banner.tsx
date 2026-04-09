import { TextAttributes } from '@opentui/core'
import { safeOpen } from '../utils/open-url'
import React, { useState, useMemo } from 'react'

import { Button } from './button'
import { Clickable } from './clickable'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { IS_FREEBUFF } from '../utils/constants'

import type { AdResponse } from '../hooks/use-gravity-ad'

interface ChoiceAdBannerProps {
  ads: AdResponse[]
  onDisableAds: () => void
  isFreeMode: boolean
}

const CARD_HEIGHT = 5 // border-top + description + spacer + cta row + border-bottom

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

export const ChoiceAdBanner: React.FC<ChoiceAdBannerProps> = ({ ads, onDisableAds, isFreeMode }) => {
  const theme = useTheme()
  const { separatorWidth, terminalWidth } = useTerminalDimensions()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isAdLabelHovered, setIsAdLabelHovered] = useState(false)
  const [isHideHovered, setIsHideHovered] = useState(false)
  const [isCloseHovered, setIsCloseHovered] = useState(false)

  // Available width for cards (terminal minus left/right margin of 1 each)
  const colAvail = terminalWidth - 2
  const widths = useMemo(() => columnWidths(ads.length, colAvail), [ads.length, colAvail])

  // Sum of all credits across choice ads
  const totalCredits = ads.reduce((sum, ad) => sum + (ad.credits ?? 0), 0)

  // Hover colors
  const hoverBorderColor = theme.link
  const hoverBgColor = theme.name === 'light' ? '#e8f0fe' : '#1a2332'

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Horizontal divider line */}
      <text style={{ fg: theme.muted }}>{'─'.repeat(terminalWidth)}</text>

      {/* Header: "Sponsored picks" + credits + Ad label */}
      <box
        style={{
          width: '100%',
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <text style={{ fg: theme.muted, attributes: TextAttributes.BOLD }}>Sponsored picks</text>
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {!IS_FREEBUFF && totalCredits > 0 && (
            <text style={{ fg: theme.muted }}>+{totalCredits} credits</text>
          )}
          {!IS_FREEBUFF ? (
            <Clickable
              onMouseDown={() => setShowInfoPanel(true)}
              onMouseOver={() => setIsAdLabelHovered(true)}
              onMouseOut={() => setIsAdLabelHovered(false)}
            >
              <text
                style={{
                  fg: isAdLabelHovered && !showInfoPanel ? theme.foreground : theme.muted,
                  flexShrink: 0,
                }}
              >
                {isAdLabelHovered && !showInfoPanel ? 'Ad ?' : '  Ad'}
              </text>
            </Clickable>
          ) : (
            <text style={{ fg: theme.muted, flexShrink: 0 }}>{'  Ad'}</text>
          )}
        </box>
      </box>

      {/* Card columns */}
      <box
        style={{
          marginLeft: 1,
          marginRight: 1,
          flexDirection: 'row',
        }}
      >
        {ads.map((ad, i) => {
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
                paddingLeft: 1,
                paddingRight: 1,
                flexDirection: 'column',
                backgroundColor: isHovered ? hoverBgColor : undefined,
              }}
            >
              <text style={{ fg: isHovered ? theme.link : theme.muted, flexShrink: 1 }}>
                {ad.adText}
              </text>
              <box style={{ flexGrow: 1 }} />
              <box style={{ flexDirection: 'row', columnGap: 1, alignItems: 'center' }}>
                <text
                  style={{
                    fg: theme.name === 'light' ? '#ffffff' : theme.background,
                    bg: isHovered ? theme.link : theme.muted,
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

      {/* Info panel: shown when Ad label is clicked */}
      {showInfoPanel && (
        <box
          style={{
            width: '100%',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          <text style={{ fg: theme.muted }}>{' ' + '┄'.repeat(separatorWidth - 2)}</text>
          <box
            style={{
              width: '100%',
              paddingLeft: 1,
              paddingRight: 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <text style={{ fg: theme.muted, flexShrink: 1 }}>
              {IS_FREEBUFF
                ? 'Ads help keep Freebuff free.'
                : 'Ads are optional and earn you credits on each impression. Feel free to hide them anytime.'}
            </text>
            <Button
              onClick={() => setShowInfoPanel(false)}
              onMouseOver={() => setIsCloseHovered(true)}
              onMouseOut={() => setIsCloseHovered(false)}
            >
              <text
                style={{
                  fg: isCloseHovered ? theme.foreground : theme.muted,
                  flexShrink: 0,
                }}
              >
                {' ✕'}
              </text>
            </Button>
          </box>
          <box
            style={{
              paddingLeft: 1,
              paddingRight: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {isFreeMode && !IS_FREEBUFF ? (
              <text style={{ fg: theme.muted }}>
                Ads are required in Free mode.
              </text>
            ) : (
              <>
                <Button
                  onClick={onDisableAds}
                  onMouseOver={() => setIsHideHovered(true)}
                  onMouseOut={() => setIsHideHovered(false)}
                >
                  <text
                    style={{
                      fg: isHideHovered ? theme.link : theme.muted,
                      attributes: TextAttributes.UNDERLINE,
                    }}
                  >
                    Hide ads
                  </text>
                </Button>
                <text style={{ fg: theme.muted }}>·</text>
                <text style={{ fg: theme.muted }}>
                  Use /ads:enable to show again
                </text>
              </>
            )}
          </box>
        </box>
      )}
    </box>
  )
}
