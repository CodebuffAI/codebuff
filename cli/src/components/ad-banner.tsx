import { TextAttributes } from '@opentui/core'
import open from 'open'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { logger } from '../utils/logger'

import type { AdResponse } from '../hooks/use-gravity-ad'

interface AdBannerProps {
  ad: AdResponse
  onDisableAds: () => void
  isFreeMode: boolean
}

const extractDomain = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const AdBanner: React.FC<AdBannerProps> = ({ ad, onDisableAds, isFreeMode }) => {
  const theme = useTheme()
  const { separatorWidth, terminalWidth } = useTerminalDimensions()
  const [isLinkHovered, setIsLinkHovered] = useState(false)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isAdLabelHovered, setIsAdLabelHovered] = useState(false)
  const [isHideHovered, setIsHideHovered] = useState(false)
  const [isCloseHovered, setIsCloseHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (ad.clickUrl) {
      open(ad.clickUrl).catch((err) => {
        logger.error(err, 'Failed to open ad link')
      })
    }
  }, [ad.clickUrl])

  // Use 'url' field for display domain (the actual destination)
  const domain = extractDomain(ad.url)
  // Use cta field for button text, with title as fallback
  const ctaText = ad.cta || ad.title || 'Learn more'

  // Calculate available width for ad text
  // Account for: padding (2), "Ad ?" label with space (5)
  const maxTextWidth = separatorWidth - 7

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Horizontal divider line */}
      <text style={{ fg: theme.muted }}>{'─'.repeat(terminalWidth)}</text>
      {/* Top line: ad text + Ad label */}
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
        <text
          style={{
            fg: theme.foreground,
            flexShrink: 1,
            maxWidth: maxTextWidth,
          }}
        >
          {ad.adText}
        </text>
        <Button
          onClick={() => setShowInfoPanel(true)}
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
        </Button>
      </box>
      {/* Bottom line: button, domain, credits */}
      <box
        style={{
          width: '100%',
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: 2,
          alignItems: 'center',
        }}
      >
        {ctaText && (
          <Button
            onClick={handleClick}
            onMouseOver={() => setIsLinkHovered(true)}
            onMouseOut={() => setIsLinkHovered(false)}
          >
            <text
              style={{
                fg: theme.name === 'light' ? '#ffffff' : theme.background,
                bg: isLinkHovered ? theme.link : theme.muted,
                attributes: TextAttributes.BOLD,
              }}
            >
              {` ${ctaText} `}
            </text>
          </Button>
        )}
        {domain && (
          <Button
            onClick={handleClick}
            onMouseOver={() => setIsLinkHovered(true)}
            onMouseOut={() => setIsLinkHovered(false)}
          >
            <text
              style={{
                fg: theme.muted,
                attributes: TextAttributes.UNDERLINE,
              }}
            >
              {domain}
            </text>
          </Button>
        )}
        <box style={{ flexGrow: 1 }} />
        {ad.credits != null && ad.credits > 0 && (
          <text style={{ fg: theme.muted }}>+{ad.credits} credits</text>
        )}
      </box>
      {/* Info panel: shown when Ad label is clicked, below the ad */}
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
              Ads are optional and earn you credits on each impression. Feel free to hide them anytime.
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
            {isFreeMode ? (
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
