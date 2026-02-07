import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/old-constants'
import { WEBSITE_URL } from '@codebuff/sdk'
import { useQuery } from '@tanstack/react-query'
import React, { useState } from 'react'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { useChatStore } from '../state/chat-store'
import { useTheme } from '../hooks/use-theme'
import { useTimeout } from '../hooks/use-timeout'
import { getAuthToken } from '../utils/auth'
import { getApiClient } from '../utils/codebuff-api'
import { copyTextToClipboard } from '../utils/clipboard'
import { BORDER_CHARS } from '../utils/ui-constants'

interface ReferralData {
  referralCode: string
  referrals: { id: string }[]
  referralLimit: number
}

export const ReferralBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const { setTimeout } = useTimeout()
  const authToken = getAuthToken()

  const { data: referralData } = useQuery({
    queryKey: ['referrals'],
    queryFn: async () => {
      const client = getApiClient()
      const response = await client.get<ReferralData>('/api/referrals', {
        includeCookie: true,
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch referral data: ${response.status}`)
      }
      return response.data!
    },
    enabled: !!authToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const referralCode = referralData?.referralCode ?? null
  const referralLink = referralCode ? `${WEBSITE_URL}/referrals/${referralCode}` : null
  const referralCount = referralData?.referrals.length ?? null
  const referralLimit = referralData?.referralLimit ?? null

  const handleCopy = async () => {
    if (!referralLink) return
    try {
      await copyTextToClipboard(referralLink, { suppressGlobalMessage: true })
      setIsCopied(true)
      setTimeout('reset-copied', () => setIsCopied(false), 2000)
    } catch {
      // Error is already logged and displayed by copyTextToClipboard
    }
  }

  const copyLabel = isCopied ? '✔ Copied!' : '⎘ Copy referral link'

  return (
    <BottomBanner
      borderColorKey="primary"
      border={['top', 'bottom', 'left', 'right']}
      onClose={() => setInputMode('default')}
    >
      <box style={{ flexDirection: 'column', gap: 0, flexGrow: 1, marginRight: 3 }}>
        <text style={{ fg: theme.foreground }}>
          {`Share this link with friends and you'll both earn ${CREDITS_REFERRAL_BONUS} credits`}
        </text>

        {referralCount !== null && referralLimit !== null && (
          <text style={{ fg: theme.muted }}>
            {`You've referred ${referralCount}/${referralLimit} people`}
          </text>
        )}

        {referralLink ? (
          <box style={{ flexDirection: 'column', gap: 0 }}>
            <text style={{ fg: theme.muted }}>{referralLink}</text>
            <box style={{ flexDirection: 'row', paddingTop: 0 }}>
              <Button
                onClick={handleCopy}
                onMouseOver={() => setIsHovered(true)}
                onMouseOut={() => setIsHovered(false)}
                style={{
                  paddingLeft: 1,
                  paddingRight: 1,
                  borderStyle: 'single',
                  borderColor: isCopied
                    ? 'green'
                    : isHovered
                      ? theme.foreground
                      : theme.primary,
                  customBorderChars: BORDER_CHARS,
                }}
              >
                <text
                  style={{
                    fg: isCopied
                      ? 'green'
                      : isHovered
                        ? theme.foreground
                        : theme.primary,
                  }}
                >
                  {copyLabel}
                </text>
              </Button>
            </box>
          </box>
        ) : (
          <text style={{ fg: theme.muted }}>Loading referral link...</text>
        )}
      </box>
    </BottomBanner>
  )
}
