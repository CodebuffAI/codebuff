import { TextAttributes } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import React, { useMemo, useState } from 'react'

import { Button } from './button'
import { ChoiceAdBanner } from './choice-ad-banner'
import { FreebuffModelSelector } from './freebuff-model-selector'
import { ShimmerText } from './shimmer-text'
import { useFreebuffCtrlCExit } from '../hooks/use-freebuff-ctrl-c-exit'
import { useGravityAd } from '../hooks/use-gravity-ad'
import { useLogo } from '../hooks/use-logo'
import { useNow } from '../hooks/use-now'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { exitFreebuffCleanly } from '../utils/freebuff-exit'
import { getLogoAccentColor, getLogoBlockColor } from '../utils/theme-system'

import type { FreebuffSessionResponse } from '../types/freebuff-session'

interface WaitingRoomScreenProps {
  session: FreebuffSessionResponse | null
  error: string | null
}

const formatWait = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return 'any moment now'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `~${totalSeconds}s`
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `~${hours}h` : `~${hours}h ${rem}m`
}

const formatElapsed = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export const WaitingRoomScreen: React.FC<WaitingRoomScreenProps> = ({
  session,
  error,
}) => {
  const theme = useTheme()
  const renderer = useRenderer()
  const { terminalWidth, contentMaxWidth } = useTerminalDimensions()

  const [sheenPosition, setSheenPosition] = useState(0)
  const blockColor = getLogoBlockColor(theme.name)
  const accentColor = getLogoAccentColor(theme.name)
  const { applySheenToChar } = useSheenAnimation({
    logoColor: theme.foreground,
    accentColor,
    blockColor,
    terminalWidth: renderer?.width ?? terminalWidth,
    sheenPosition,
    setSheenPosition,
  })
  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    accentColor,
    blockColor,
    applySheenToChar,
  })

  // Always enable ads in the waiting room — this is where monetization lives.
  // forceStart bypasses the "wait for first user message" gate inside the hook,
  // which would otherwise block ads here since no conversation exists yet.
  // Uses Carbon (BuySellAds); in-chat ads still use the Gravity default.
  const { adData, recordImpression } = useGravityAd({
    enabled: true,
    forceStart: true,
    provider: 'carbon',
  })

  useFreebuffCtrlCExit()

  const [exitHover, setExitHover] = useState(false)

  // Elapsed-in-queue timer. Starts from `queuedAt` so it keeps ticking even if
  // the user wanders away and comes back.
  const queuedAtMs = useMemo(() => {
    if (session?.status === 'queued') return Date.parse(session.queuedAt)
    return null
  }, [session])
  const now = useNow(1000, queuedAtMs !== null)
  const elapsedMs = queuedAtMs ? now - queuedAtMs : 0

  const isQueued = session?.status === 'queued'
  // 'none' = user hasn't joined any queue yet. We're in the pre-chat landing
  // state: show the picker with live N-ahead hints and a prompt. Picking a
  // model triggers joinFreebuffQueue, which POSTs and transitions us to
  // 'queued' (waiting room) or straight to 'active' (chat) if no wait.
  const isLanding = session?.status === 'none'

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: theme.background,
      }}
    >
      {/* Top-right exit affordance so mouse users have a clear way out even
          when they don't know Ctrl+C works. width: '100%' is required for
          justifyContent: 'flex-end' to actually push the X to the right. */}
      <box
        style={{
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingTop: 1,
          paddingRight: 2,
          flexShrink: 0,
        }}
      >
        <Button
          onClick={exitFreebuffCleanly}
          onMouseOver={() => setExitHover(true)}
          onMouseOut={() => setExitHover(false)}
          style={{ paddingLeft: 1, paddingRight: 1 }}
        >
          <text
            style={{ fg: exitHover ? theme.foreground : theme.muted }}
            attributes={exitHover ? TextAttributes.BOLD : TextAttributes.NONE}
          >
            ✕
          </text>
        </Button>
      </box>

      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          alignItems: 'center',
          // flex-end so the logo + title + info clump sits just above the ad,
          // matching how chat anchors its header/messages to the input bar.
          justifyContent: 'flex-end',
          paddingLeft: 2,
          paddingRight: 2,
          paddingBottom: 1,
          gap: 1,
        }}
      >
        <box style={{ marginBottom: 1 }}>{logoComponent}</box>

        <box
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
            maxWidth: contentMaxWidth,
          }}
        >
          {error && !session && (
            <text style={{ fg: theme.secondary, wrapMode: 'word' }}>
              ⚠ {error}
            </text>
          )}

          {!session && !error && (
            <text style={{ fg: theme.muted }}>
              <ShimmerText text="Connecting…" />
            </text>
          )}

          {isLanding && (
            <>
              <text style={{ fg: theme.foreground, marginBottom: 1 }}>
                Pick a model to start
              </text>
              <FreebuffModelSelector />
            </>
          )}

          {isQueued && session && (
            <>
              <text style={{ fg: theme.foreground, marginBottom: 1 }}>
                {session.position === 1
                  ? "You're next in line"
                  : "You're in the waiting room"}
              </text>

              <FreebuffModelSelector />

              <box
                style={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 0,
                  marginTop: 1,
                }}
              >
                <text style={{ fg: theme.foreground, alignSelf: 'flex-start' }}>
                  <span fg={theme.muted}>Position </span>
                  <span fg={theme.primary} attributes={TextAttributes.BOLD}>
                    {session.position}
                  </span>
                  <span fg={theme.muted}> / {session.queueDepth}</span>
                </text>
                <text style={{ fg: theme.muted, alignSelf: 'flex-start' }}>
                  <span>Wait     </span>
                  {session.position === 1
                    ? 'any moment now'
                    : formatWait(session.estimatedWaitMs)}
                </text>
                <text style={{ fg: theme.muted, alignSelf: 'flex-start' }}>
                  <span>Elapsed  </span>
                  {formatElapsed(elapsedMs)}
                </text>
              </box>
            </>
          )}

          {/* Server says the waiting room is disabled — this screen should not
              normally render in that case, but show a minimal message just in
              case App.tsx's guard is bypassed. */}
          {session?.status === 'disabled' && (
            <text style={{ fg: theme.muted }}>Waiting room disabled.</text>
          )}

          {/* Country outside the free-mode allowlist. Terminal — polling has
              stopped. Tell the user up front rather than letting them wait in
              the queue only to be rejected at the chat/completions gate. */}
          {session?.status === 'country_blocked' && (
            <>
              <text style={{ fg: theme.secondary, marginBottom: 1 }}>
                ⚠ Free mode isn't available in your region
              </text>
              <text style={{ fg: theme.muted, wrapMode: 'word' }}>
                We detected your location as{' '}
                <span fg={theme.foreground}>{session.countryCode}</span>,
                which is outside the countries where freebuff is currently
                offered. Press Ctrl+C to exit.
              </text>
            </>
          )}

          {/* Account banned. Terminal — polling has stopped. Blocking here
              stops banned bots from re-entering the queue every few seconds
              and inflating queueDepth between admission-tick sweeps. */}
          {session?.status === 'banned' && (
            <>
              <text style={{ fg: theme.secondary, marginBottom: 1 }}>
                ⚠ Account unavailable
              </text>
              <text style={{ fg: theme.muted, wrapMode: 'word' }}>
                This account can't use freebuff. If you think this is a
                mistake, contact support@codebuff.com. Press Ctrl+C to exit.
              </text>
            </>
          )}
        </box>
      </box>

      {/* Ad banner pinned to the bottom, same look-and-feel as in chat. */}
      {adData && (
        <box style={{ flexShrink: 0 }}>
          <ChoiceAdBanner
            ads={adData.variant === 'choice' ? adData.ads : [adData.ad]}
            onImpression={recordImpression}
          />
        </box>
      )}

      {/* Horizontal separator (mirrors chat input divider style) */}
      {!adData && (
        <text style={{ fg: theme.muted, flexShrink: 0 }}>
          {'─'.repeat(terminalWidth)}
        </text>
      )}
    </box>
  )
}
