import open from 'open'
import React, { useCallback, useEffect, useState } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { logger } from '../utils/logger'

import type { AdResponse } from '../hooks/use-gravity-ad'

interface AdBannerProps {
  ad: AdResponse
}

const extractDomain = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const AdBanner: React.FC<AdBannerProps> = ({ ad }) => {
  useEffect(() => {
    logger.info(
      { adText: ad.adText?.substring(0, 50), hasClickUrl: !!ad.clickUrl },
      '[gravity] Rendering AdBanner'
    )
  }, [ad])
  const theme = useTheme()
  const { separatorWidth, terminalWidth } = useTerminalDimensions()
  const [isLinkHovered, setIsLinkHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (ad.clickUrl) {
      open(ad.clickUrl).catch((err) => {
        logger.error(err, 'Failed to open ad link')
      })
    }
  }, [ad.clickUrl])

  // Use 'url' field for display domain (the actual destination)
  const domain = extractDomain(ad.url)
  // Use title as CTA
  const ctaText = ad.title

  // Calculate available width for ad text
  // Account for: padding (2), "Ad" label with space (3)
  const maxTextWidth = separatorWidth - 5

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Horizontal divider line */}
      <text style={{ fg: theme.muted }}>{'─'.repeat(terminalWidth)}</text>
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
        <box
          style={{
            flexDirection: 'column',
            flexShrink: 1,
            maxWidth: maxTextWidth,
          }}
        >
          <text
            style={{
              fg: theme.foreground,
            }}
          >
            {ad.adText}
          </text>
          <box style={{ flexDirection: 'row', gap: 2 }}>
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
                  }}
                >
                  {` ${ctaText} `}
                </text>
              </Button>
            )}
            {domain && (
              <text style={{ fg: theme.muted }}>{domain}</text>
            )}
          </box>
        </box>
        <text style={{ fg: theme.muted, flexShrink: 0 }}>Ad</text>
      </box>
    </box>
  )
}
