import React, { useEffect, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { IS_FREEBUFF } from '../utils/constants'

import type { FreebuffSessionResponse } from '../types/freebuff-session'

const LOW_THRESHOLD_MS = 60_000

const formatRemaining = (ms: number): string => {
  if (ms <= 0) return 'expiring…'
  const totalSeconds = Math.ceil(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s left`
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h left` : `${hours}h ${rem}m left`
}

/**
 * Small countdown shown while a freebuff session is active. Renders the
 * time remaining until the server-issued `expiresAt` so users aren't
 * surprised when their seat is released. Returns null in non-freebuff
 * builds or when no active session exists — safe to always mount.
 */
export const FreebuffSessionCountdown: React.FC<{
  session: FreebuffSessionResponse | null
}> = ({ session }) => {
  const theme = useTheme()
  const expiresAtMs =
    session?.status === 'active' ? Date.parse(session.expiresAt) : null

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAtMs) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAtMs])

  if (!IS_FREEBUFF || !expiresAtMs) return null

  const remainingMs = expiresAtMs - now
  // Muted until the final minute, then a soft warning — deliberately not
  // `theme.error` so the countdown reads informational, not alarming.
  const color = remainingMs < LOW_THRESHOLD_MS ? theme.warning : theme.muted

  return <span fg={color}>{formatRemaining(remainingMs)}</span>
}
