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
  // recentCount already includes the active session's 1.0-unit reservation
  // (written as an admit row at promotion), so it reflects everything counted
  // against the quota — spent plus in-flight. Show it as the total used to match
  // the model selection menu and the other session-status screens.
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
          {label} used · resets in {resetCountdown}
        </span>
      </text>
    </box>
  )
}
