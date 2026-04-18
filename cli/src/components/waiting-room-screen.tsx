import { TextAttributes } from '@opentui/core'
import { useKeyboard, useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { AdBanner } from './ad-banner'
import { Button } from './button'
import { ChoiceAdBanner } from './choice-ad-banner'
import { ShimmerText } from './shimmer-text'
import { endFreebuffSessionBestEffort } from '../hooks/use-freebuff-session'
import { useGravityAd } from '../hooks/use-gravity-ad'
import { useLogo } from '../hooks/use-logo'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { flushAnalytics } from '../utils/analytics'
import { withTimeout } from '../utils/terminal-color-detection'
import { getLogoAccentColor, getLogoBlockColor } from '../utils/theme-system'

import type { FreebuffSessionResponse } from '../types/freebuff-session'
import type { KeyEvent } from '@opentui/core'

/** Cap on exit cleanup (DELETE /session + flushAnalytics) so a slow network
 *  doesn't block process exit. */
const EXIT_CLEANUP_TIMEOUT_MS = 1000

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
  const { ad, adData, recordImpression } = useGravityAd({
    enabled: true,
    forceStart: true,
  })

  // Release the seat + flush analytics before exit. Used by both Ctrl+C and
  // the top-right X button so they always do the same cleanup.
  const handleExit = useCallback(() => {
    const cleanup = Promise.allSettled([
      flushAnalytics(),
      endFreebuffSessionBestEffort(),
    ])
    withTimeout(cleanup, EXIT_CLEANUP_TIMEOUT_MS, undefined).finally(() => {
      process.exit(0)
    })
  }, [])

  // Ctrl+C exits. Stdin is in raw mode, so SIGINT never fires — the key comes
  // through as a normal OpenTUI key event.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.ctrl && key.name === 'c') {
          key.preventDefault?.()
          handleExit()
        }
      },
      [handleExit],
    ),
  )

  const [exitHover, setExitHover] = useState(false)

  // Elapsed-in-queue timer. Starts from `queuedAt` so it keeps ticking even if
  // the user wanders away and comes back.
  const queuedAtMs = useMemo(() => {
    if (session?.status === 'queued') return Date.parse(session.queuedAt)
    return null
  }, [session])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsedMs = queuedAtMs ? now - queuedAtMs : 0

  const isQueued = session?.status === 'queued'

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
          onClick={handleExit}
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

          {((!session && !error) || session?.status === 'none') && (
            <text style={{ fg: theme.muted }}>
              <ShimmerText text="Joining the waiting room…" />
            </text>
          )}

          {isQueued && session && (
            <>
              <text style={{ fg: theme.foreground, marginBottom: 1 }}>
                You're in the waiting room
              </text>

              <box
                style={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 0,
                }}
              >
                {session.position === 1 ? (
                  <>
                    <text style={{ fg: theme.primary, alignSelf: 'flex-start' }}>
                      <ShimmerText text="Next in line" />
                    </text>
                    <text style={{ fg: theme.muted, alignSelf: 'flex-start' }}>
                      {session.queueDepth === 1
                        ? 'just you in line right now'
                        : `${session.queueDepth} people in line`}
                    </text>
                  </>
                ) : (
                  <text style={{ fg: theme.foreground, alignSelf: 'flex-start' }}>
                    <span fg={theme.muted}>Position </span>
                    <span fg={theme.primary} attributes={TextAttributes.BOLD}>
                      {session.position}
                    </span>
                    <span fg={theme.muted}> / {session.queueDepth}</span>
                  </text>
                )}
                {session.position !== 1 && (
                  <text style={{ fg: theme.foreground, alignSelf: 'flex-start' }}>
                    <span fg={theme.muted}>Wait     </span>
                    <span fg={theme.primary}>
                      <ShimmerText text={formatWait(session.estimatedWaitMs)} />
                    </span>
                  </text>
                )}
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
        </box>
      </box>

      {/* Ad banner pinned to the bottom, same look-and-feel as in chat. */}
      {ad && (
        <box style={{ flexShrink: 0 }}>
          {adData?.variant === 'choice' ? (
            <ChoiceAdBanner
              ads={adData.ads}
              onImpression={recordImpression}
            />
          ) : (
            <AdBanner ad={ad} onDisableAds={() => {}} isFreeMode />
          )}
        </box>
      )}

      {/* Horizontal separator (mirrors chat input divider style) */}
      {!ad && (
        <text style={{ fg: theme.muted, flexShrink: 0 }}>
          {'─'.repeat(terminalWidth)}
        </text>
      )}
    </box>
  )
}
