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
      '[gravity] Rendering AdBanner',
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
  // Use cta field for button text, with title as fallback
  const ctaText = ad.cta || ad.title || 'Learn more'

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
        <text style={{ fg: theme.muted, flexShrink: 0 }}>Ad</text>
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
              }}
            >
              {` ${ctaText} `}
            </text>
          </Button>
        )}
        {domain && <text style={{ fg: theme.muted }}>{domain}</text>}
        <box style={{ flexGrow: 1 }} />
        {ad.credits != null && ad.credits > 0 && (
          <text style={{ fg: theme.muted }}>+{ad.credits} credits</text>
        )}
      </box>
    </box>
  )
}
