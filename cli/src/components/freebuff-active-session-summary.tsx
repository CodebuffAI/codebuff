import React from 'react'

import { useFreebuffSessionProgress } from '../hooks/use-freebuff-session-progress'
import { useNow } from '../hooks/use-now'
import { useTheme } from '../hooks/use-theme'
import { formatFreebuffPremiumResetCountdown } from '../utils/freebuff-premium-reset'
import { formatSessionUnits } from '../utils/format-session-units'

import type { FreebuffSessionResponse } from '../types/freebuff-session'

interface FreebuffActiveSessionSummaryProps {
  session: FreebuffSessionResponse | null
}

export const FreebuffActiveSessionSummary: React.FC<
  FreebuffActiveSessionSummaryProps
> = ({ session }) => {
  const theme = useTheme()
  const now = useNow(60_000, session?.status === 'active')
  const progress = useFreebuffSessionProgress(session)
  const quota = session?.status === 'active' ? session.rateLimit : undefined

  if (session?.status !== 'active' || !progress) {
    return null
  }

  if (!quota) {
    return null
  }

  const resetCountdown = formatFreebuffPremiumResetCountdown(
    new Date(quota.resetAt),
    now
  )
  const label =
    'accessTier' in session && session.accessTier === 'limited'
      ? 'sessions'
      : 'premium sessions'

  return (
    <box
      style={{
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
        flexShrink: 0,
      }}
    >
      <text style={{ wrapMode: 'word', fg: theme.muted }}>
        <span fg={theme.foreground}>
          {formatSessionUnits(quota.recentCount)} of {quota.limit}
        </span>
        <span fg={theme.muted}>
          {' '}
          {label} used today · resets in {resetCountdown}
        </span>
      </text>
    </box>
  )
}
