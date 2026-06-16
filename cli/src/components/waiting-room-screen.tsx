import { TextAttributes } from '@opentui/core'
import { useKeyboard, useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import { ChoiceAdBanner, AD_CARD_HEIGHT } from './ad-banner'
import { FreebuffModelSelector } from './freebuff-model-selector'
import { ShimmerText } from './shimmer-text'
import {
  refreshFreebuffLandingMetadata,
  takeOverFreebuffSession,
} from '../hooks/use-freebuff-session'
import { useFreebuffCtrlCExit } from '../hooks/use-freebuff-ctrl-c-exit'
import { useFreebuffStreakQuery } from '../hooks/use-freebuff-streak-query'
import { useGravityAd } from '../hooks/use-gravity-ad'
import { useLogo } from '../hooks/use-logo'
import { useNow } from '../hooks/use-now'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { exitFreebuffCleanly } from '../utils/freebuff-exit'
import {
  formatFreebuffPremiumResetCountdown,
  getFreebuffPremiumResetAt,
} from '../utils/freebuff-premium-reset'
import { formatSessionUnits } from '../utils/format-session-units'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { getLogoAccentColor, getLogoBlockColor } from '../utils/theme-system'
import {
  FREEBUFF_ENABLE_STREAK_IN_UI,
  FREEBUFF_LIMITED_SESSION_LIMIT,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
} from '@codebuff/common/constants/freebuff-models'
import { getRateLimitsByModel } from '@codebuff/common/types/freebuff-session'
import { formatFreebuffHardBlockedPrivacySignals } from '@codebuff/common/util/freebuff-privacy'
import { pluralize } from '@codebuff/common/util/string'

import type { FreebuffSessionResponse } from '../types/freebuff-session'
import type { FreebuffIpPrivacySignal } from '@codebuff/common/types/freebuff-session'
import type { KeyEvent } from '@opentui/core'

interface WaitingRoomScreenProps {
  session: FreebuffSessionResponse | null
  error: string | null
}

/** Landing-screen heading. Referenced both as rendered text and by the
 *  picker's height-budget math (wrappedRows), so it lives in one place to keep
 *  the two from drifting. */
const LANDING_HEADING = 'Start coding for free'

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

/** "in ~3h 20m" / "in ~45 min" / "in under a minute". Used on the
 *  rate-limited screen so users know when they can try again. */
const formatRetryAfter = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return 'any moment now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}

const PRIVACY_SIGNAL_LABELS: Partial<Record<FreebuffIpPrivacySignal, string>> =
{
  anonymous: 'anonymized network',
  proxy: 'proxy',
  relay: 'relay',
  res_proxy: 'residential proxy',
  tor: 'Tor',
  vpn: 'VPN',
  hosting: 'hosting network',
  service: 'privacy service',
}

const formatPrivacySignalList = (
  signals: FreebuffIpPrivacySignal[] | undefined,
): string => {
  const labels = Array.from(
    new Set(
      signals
        ?.map((signal) => PRIVACY_SIGNAL_LABELS[signal])
        .filter((label): label is string => Boolean(label)) ?? [],
    ),
  )

  if (labels.length === 0) {
    return 'VPN, Tor, proxy, relay, or anonymized network'
  }
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`
}

/** "BR" → "Brazil". Falls back to the raw code when the runtime can't
 *  resolve it (malformed code, missing ICU data). */
const formatCountryName = (countryCode: string): string => {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) ??
      countryCode
    )
  } catch {
    return countryCode
  }
}

// Tone matters here: this is shown to users who, through no fault of their
// own, get the smaller model set. Frame it as model *availability* ("aren't
// available in BR yet"), never as restricted *access* ("limited mode",
// "blocked") — clear enough to answer "why these models?" for someone who
// goes looking, quiet enough to ignore for someone who doesn't. The VPN case
// is the one the user can act on, so it leads with the action. Rendered
// directly under the model list — that's where "why these models?" gets asked.
const getLimitedModeNotice = (
  session: FreebuffSessionResponse | null,
): string | null => {
  if (!session || !('countryBlockReason' in session)) {
    return "Some models aren't available on this connection"
  }

  const countryCode =
    'countryCode' in session &&
      session.countryCode &&
      session.countryCode !== 'UNKNOWN'
      ? session.countryCode
      : null

  switch (session.countryBlockReason) {
    case 'anonymous_network':
      return `Using a ${formatPrivacySignalList(
        session.ipPrivacySignals ?? undefined,
      )}? More models are available on a direct connection`
    case 'country_not_allowed':
      return `Some models aren't available in ${
        countryCode ? formatCountryName(countryCode) : 'your region'
      } yet`
    case 'anonymized_or_unknown_country':
    case 'missing_client_ip':
    case 'unresolved_client_ip':
      return "We couldn't confirm your region, so we're showing models available everywhere"
    case 'ip_privacy_lookup_failed':
      return "We couldn't finish a network check, so we're showing models available everywhere"
    default:
      return "Some models aren't available on this connection"
  }
}

const TakeoverPrompt: React.FC = () => {
  const theme = useTheme()
  const [pending, setPending] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0) // 0 = Take over, 1 = Exit

  const handleTakeover = useCallback(() => {
    if (pending) return
    setPending(true)
    takeOverFreebuffSession().finally(() => setPending(false))
  }, [pending])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        const name = key.name ?? ''
        const isConfirm = isPlainEnterKey(key)
        const isExit = name === 'escape' || name === 'esc'
        const isTab = name === 'tab'
        const isShiftTab = key.shift === true && isTab
        const isRight = name === 'right'
        const isLeft = name === 'left'

        if (isExit) {
          key.preventDefault?.()
          exitFreebuffCleanly()
          return
        }

        if (isConfirm) {
          key.preventDefault?.()
          if (focusedIndex === 0) {
            handleTakeover()
          } else {
            exitFreebuffCleanly()
          }
          return
        }

        if (isRight || isTab) {
          key.preventDefault?.()
          setFocusedIndex((prev) => (prev + 1) % 2)
          return
        }

        if (isLeft || isShiftTab) {
          key.preventDefault?.()
          setFocusedIndex((prev) => (prev - 1 + 2) % 2)
          return
        }
      },
      [focusedIndex, handleTakeover],
    ),
  )

  const isTakeoverFocused = focusedIndex === 0
  const isExitFocused = focusedIndex === 1

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        width: '100%',
      }}
    >
      <text style={{ fg: theme.foreground }} attributes={TextAttributes.BOLD}>
        Freebuff is already running
      </text>

      <text style={{ fg: theme.muted }}>
        Only one freebuff instance is allowed at a time.
      </text>

      <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
        <Button
          onClick={handleTakeover}
          onMouseOver={() => setFocusedIndex(0)}
          style={{ paddingLeft: 1, paddingRight: 1 }}
          border={['top', 'bottom', 'left', 'right']}
          borderStyle="single"
          borderColor={theme.primary}
        >
          <text
            style={{
              fg: isTakeoverFocused ? theme.background : theme.foreground,
              bg: isTakeoverFocused ? theme.primary : undefined,
            }}
            attributes={TextAttributes.BOLD}
          >
            {pending ? 'Taking over...' : 'Take over'}
          </text>
        </Button>
        <Button
          onClick={exitFreebuffCleanly}
          onMouseOver={() => setFocusedIndex(1)}
          style={{ paddingLeft: 1, paddingRight: 1 }}
          border={['top', 'bottom', 'left', 'right']}
          borderStyle="single"
          borderColor={isExitFocused ? theme.foreground : theme.muted}
        >
          <text
            style={{ fg: isExitFocused ? theme.foreground : theme.muted }}
            attributes={
              isExitFocused ? TextAttributes.BOLD : TextAttributes.NONE
            }
          >
            Exit
          </text>
        </Button>
      </box>
    </box>
  )
}

/** Inline streak indicator rendered as the line immediately after the
 *  sessions-used/title row. Shows "Streak: N days" when the user has a
 *  streak; for streak === 0 the row is rendered blank so the picker
 *  doesn't jump once they earn their first day. */
const StreakInlineLine: React.FC<{
  streak: number
  marginTop: number
}> = ({ streak, marginTop }) => {
  const theme = useTheme()

  if (streak <= 0) {
    return <text style={{ marginTop, flexShrink: 0 }}> </text>
  }

  return (
    <text
      style={{
        fg: theme.muted,
        marginTop,
        flexShrink: 0,
        wrapMode: 'none',
      }}
    >
      Streak: {pluralize(streak, 'day')}
    </text>
  )
}

export const WaitingRoomScreen: React.FC<WaitingRoomScreenProps> = ({
  session,
  error,
}) => {
  const theme = useTheme()
  const renderer = useRenderer()
  const { terminalWidth, terminalHeight, contentMaxWidth } =
    useTerminalDimensions()

  // Progressive disclosure as the terminal gets shorter. The picker is the
  // only thing the user must be able to reach, so chrome is shed first:
  //   tall   (>=40): full 6-line ASCII logo + roomy spacing, content anchored low
  //   medium (>=20): one-line text wordmark — keeps branding for ~1 row so the
  //                  model list (esp. expanded) gets ~6 rows back vs the big logo
  //   short  (<20) : no logo at all
  //   tiny   (<18) : also drop the ad banner
  // The big logo is reserved for genuinely tall windows; at the common ~30-row
  // height we show the compact wordmark so more models fit without scrolling.
  // Section headers always show — the picker scrolls within whatever rows
  // remain (see selectorMaxHeight below), so there's no need to hide them.
  const logoMode: 'full' | 'text' | 'none' =
    terminalHeight >= 40 ? 'full' : terminalHeight >= 20 ? 'text' : 'none'
  const compact = terminalHeight < 22
  const showAds = terminalHeight >= 18
  const textMarginBottom = 1
  const logoLines = logoMode === 'full' ? 6 : logoMode === 'text' ? 1 : 0

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
    // 'text' forces the one-line variant; 'none' is handled by not rendering.
    maxHeight: logoMode === 'full' ? undefined : 1,
  })

  // Always enable ads in the waiting room — this is where monetization lives.
  // forceStart bypasses the "wait for first user message" gate inside the hook,
  // which would otherwise block ads here since no conversation exists yet.
  // The server tries Gravity first, then falls back to ZeroClick and Carbon.
  const { ads, recordClick, recordImpression } = useGravityAd({
    enabled: true,
    forceStart: true,
    provider: 'gravity',
    surface: 'waiting_room',
  })

  useFreebuffCtrlCExit()

  const [exitHover, setExitHover] = useState(false)

  const isQueued = session?.status === 'queued'
  const accessTier =
    session && 'accessTier' in session ? session.accessTier : 'full'
  // Hidden in compact terminals: the notice is nice-to-have context, and
  // below 22 rows every line competes with the picker itself.
  const limitedModeNotice =
    accessTier === 'limited' && !compact ? getLimitedModeNotice(session) : null
  // 'none' = user hasn't joined any queue yet. We're in the pre-chat landing
  // state: show the picker with live N-in-line hints and a prompt. Picking a
  // model triggers joinFreebuffQueue, which POSTs and transitions us to
  // 'queued' (waiting room) or straight to 'active' (chat) if no wait.
  const isLanding = session?.status === 'none'
  const streakQuery = useFreebuffStreakQuery({
    enabled: FREEBUFF_ENABLE_STREAK_IN_UI && (isLanding || isQueued),
  })
  const streak = streakQuery.data?.streak ?? 0
  // Reserve the streak row whenever the feature could appear so the picker
  // doesn't jump when the query resolves or the user crosses from 0 → 1.
  // The component itself renders blank space when streak === 0.
  const reserveStreakSlot =
    FREEBUFF_ENABLE_STREAK_IN_UI && (isLanding || isQueued) && !compact
  // Elapsed-in-queue timer. Starts from `queuedAt` so it keeps ticking even if
  // the user wanders away and comes back. On the landing picker we tick once a
  // minute so the session reset countdown stays fresh.
  const queuedAtMs = useMemo(() => {
    if (session?.status === 'queued') return Date.parse(session.queuedAt)
    return null
  }, [session])
  const now = useNow(isQueued ? 1000 : 60_000, isQueued || isLanding)
  const elapsedMs = queuedAtMs ? now - queuedAtMs : 0

  // Free-session quota counter for the title line. All free models share one
  // pool; the server replicates the same snapshot under each free model
  // id, so any entry has the right count. Renders amber when exhausted so
  // the limit reads as "you've hit it" rather than just another count.
  const rateLimitsByModel = getRateLimitsByModel(session)
  const sessionRateLimit = rateLimitsByModel
    ? Object.values(rateLimitsByModel)[0]
    : undefined
  const sharedSessionUsed = sessionRateLimit?.recentCount ?? 0
  // Hide the "0 of 5 … used" line entirely for a fresh user — a zeroed counter
  // is noise on the landing screen. It appears once any session is consumed.
  const showSessionCounter = sharedSessionUsed > 0
  const isSessionExhausted =
    sharedSessionUsed >=
    (accessTier === 'limited'
      ? FREEBUFF_LIMITED_SESSION_LIMIT
      : FREEBUFF_PREMIUM_SESSION_LIMIT)
  const sessionUsedColor = isSessionExhausted ? theme.secondary : theme.muted
  const sessionLimit =
    accessTier === 'limited'
      ? FREEBUFF_LIMITED_SESSION_LIMIT
      : FREEBUFF_PREMIUM_SESSION_LIMIT
  const sessionLabel = accessTier === 'limited' ? 'sessions' : 'premium sessions'
  const formattedSharedSessionUsed = formatSessionUnits(sharedSessionUsed)
  const sessionResetAt = getFreebuffPremiumResetAt({
    rateLimitsByModel,
    nowMs: now,
  })
  const sessionResetAtMs = sessionResetAt.getTime()
  const sessionResetCountdown = formatFreebuffPremiumResetCountdown(
    sessionResetAt,
    now,
  )

  // Rows the picker may occupy = terminal height minus the fixed chrome
  // around it. Each term mirrors the real layout exactly (no padded
  // estimate, no blanket safety row) so the scrollbox fills the available
  // space with no dead band below it:
  //   - top bar: paddingTop 1 + the ✕ row = 2
  //   - ad banner: AD_CARD_HEIGHT, only when shown
  //   - main box: its paddingTop (text-logo tier only) + paddingBottom 1
  //   - logo block: lines + marginBottom 1 (always, when shown) + gap (full)
  //   - the prompt/counter (landing) or the position panel (queued)
  // Line wrapping is derived from the actual strings vs contentMaxWidth, so
  // a wrapped counter is accounted for precisely instead of guessed at.
  const wrappedRows = (text: string) =>
    Math.max(1, Math.ceil(text.length / contentMaxWidth))
  const counterText =
    `${formattedSharedSessionUsed} of ${sessionLimit} ${sessionLabel} used, ` +
    `resets in ${sessionResetCountdown}`
  const logoBlockRows =
    logoMode === 'none'
      ? 0
      : logoLines + 1 /* marginBottom */ + (logoMode === 'full' ? 1 : 0)
  const mainPaddingRows = (logoMode === 'text' ? 1 : 0) + 1
  const adRows = showAds ? AD_CARD_HEIGHT : 0
  // Status lines render below the picker, each with marginTop 1: the session
  // counter (landing only), then the limited-mode notice, then the streak.
  // They still eat into the picker's height budget regardless of being above
  // or below it.
  const streakRows = reserveStreakSlot ? 1 + 1 : 0
  const noticeRows = limitedModeNotice
    ? 1 /* marginTop */ + wrappedRows(limitedModeNotice)
    : 0
  const belowPickerRows = streakRows + noticeRows
  const counterRows = showSessionCounter
    ? 1 /* marginTop */ + wrappedRows(counterText)
    : 0
  const reservedChrome = 2 + adRows + mainPaddingRows + logoBlockRows
  const landingTextRows =
    wrappedRows(LANDING_HEADING) +
    textMarginBottom +
    counterRows +
    belowPickerRows
  const queuedTitleText =
    session?.status === 'queued' && session.position === 1
      ? "You're next in line"
      : "You're in the waiting room"
  const queuedTextRows =
    wrappedRows(queuedTitleText) +
    1 +
    4 /* position panel */ +
    belowPickerRows
  const selectorMaxHeight = Math.max(
    3,
    terminalHeight -
    reservedChrome -
    (isQueued ? queuedTextRows : landingTextRows),
  )

  useEffect(() => {
    if (!isLanding || !sessionRateLimit) return

    const delayMs = Math.max(0, sessionResetAtMs - Date.now() + 1_000)
    const timer = setTimeout(() => {
      refreshFreebuffLandingMetadata().catch(() => { })
    }, delayMs)

    return () => clearTimeout(timer)
  }, [isLanding, sessionRateLimit, sessionResetAtMs])

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
          justifyContent to actually push the X to the right. */}
      <box
        style={{
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingTop: 1,
          paddingLeft: 2,
          paddingRight: 2,
          flexShrink: 0,
        }}
      >
        {/* Empty spacer: justifyContent space-between needs a left sibling to
            keep the ✕ pushed to the right. */}
        <box />
        <Button
          onClick={exitFreebuffCleanly}
          onMouseOver={() => setExitHover(true)}
          onMouseOut={() => setExitHover(false)}
          style={{ paddingLeft: 1, paddingRight: 1 }}
        >
          <text
            style={{ fg: exitHover ? theme.foreground : theme.muted }}
            attributes={TextAttributes.BOLD}
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
          // Full logo: anchor the clump low (flex-end), matching how chat pins
          // its header/messages to the input bar. Text wordmark: center the
          // clump so a short (collapsed) picker reads as a balanced card instead
          // of leaving a void above the ad. No logo (tiny terminals): hug the
          // top, since the content nearly fills the height anyway and centering
          // would just shave rows off the top.
          justifyContent:
            logoMode === 'full'
              ? 'flex-end'
              : logoMode === 'text'
                ? 'center'
                : 'flex-start',
          paddingLeft: 2,
          paddingRight: 2,
          // A row of breathing room under the top bar for the text logo; the
          // full logo brings its own spacing and the tiniest (no-logo) screens
          // can't spare the row.
          paddingTop: logoMode === 'text' ? 1 : 0,
          paddingBottom: 1,
          gap: logoMode === 'full' ? 1 : 0,
        }}
      >
        {logoMode !== 'none' && (
          <box style={{ marginBottom: 1, flexShrink: 0 }}>
            {logoComponent}
          </box>
        )}

        <box
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
            maxWidth: contentMaxWidth,
          }}
        >
          {error && (!session || session.status === 'none') && (
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
            <box
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 0,
              }}
            >
              <text
                style={{
                  marginBottom: textMarginBottom,
                  wrapMode: 'word',
                }}
              >
                <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
                  {LANDING_HEADING}
                </span>
              </text>
              <FreebuffModelSelector maxHeight={selectorMaxHeight} />
              {showSessionCounter && (
                <text
                  style={{
                    fg: theme.muted,
                    marginTop: 1,
                    wrapMode: 'word',
                  }}
                >
                  <span fg={sessionUsedColor}>
                    {formattedSharedSessionUsed} of {sessionLimit} {sessionLabel}{' '}
                    used
                  </span>
                  <span fg={theme.muted}>
                    {', '}
                    resets in {sessionResetCountdown}
                  </span>
                </text>
              )}
              {limitedModeNotice && (
                <text
                  style={{ fg: theme.muted, wrapMode: 'word', marginTop: 1 }}
                >
                  {limitedModeNotice}
                </text>
              )}
              {reserveStreakSlot && (
                <StreakInlineLine streak={streak} marginTop={1} />
              )}
            </box>
          )}

          {session?.status === 'takeover_prompt' && <TakeoverPrompt />}

          {isQueued && session && (
            <box
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 0,
              }}
            >
              <text
                style={{
                  fg: theme.foreground,
                  marginBottom: 1,
                }}
                attributes={TextAttributes.BOLD}
              >
                {queuedTitleText}
              </text>
              <FreebuffModelSelector maxHeight={selectorMaxHeight} />
              {limitedModeNotice && (
                <text
                  style={{ fg: theme.muted, wrapMode: 'word', marginTop: 1 }}
                >
                  {limitedModeNotice}
                </text>
              )}
              {reserveStreakSlot && (
                <StreakInlineLine streak={streak} marginTop={1} />
              )}

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
                  <span>Wait </span>
                  {session.position === 1
                    ? 'any moment now'
                    : formatWait(session.estimatedWaitMs)}
                </text>
                <text style={{ fg: theme.muted, alignSelf: 'flex-start' }}>
                  <span>Elapsed </span>
                  {formatElapsed(elapsedMs)}
                </text>
              </box>
            </box>
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
                {session.countryBlockReason === 'anonymous_network' ? (
                  <>
                    We detected{' '}
                    {formatFreebuffHardBlockedPrivacySignals(
                      session.ipPrivacySignals,
                    )}{' '}
                    traffic
                    {session.countryCode === 'UNKNOWN' ? (
                      ''
                    ) : (
                      <>
                        {' '}
                        from{' '}
                        <span fg={theme.foreground}>{session.countryCode}</span>
                      </>
                    )}
                    . Freebuff can't be used from VPN, proxy, or Tor traffic.
                    Disable it and restart Freebuff to try again.
                  </>
                ) : session.countryCode === 'UNKNOWN' ? (
                  <>
                    We couldn't verify an eligible location for this request.
                    VPN, Tor, proxy, or unknown-location traffic can't use
                    freebuff. Press Ctrl+C to exit.
                  </>
                ) : (
                  <>
                    We detected your location as{' '}
                    <span fg={theme.foreground}>{session.countryCode}</span>,
                    which is outside the countries where freebuff is currently
                    offered. Press Ctrl+C to exit.
                  </>
                )}
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
                This account has been suspended and can't use freebuff. If you
                think this is a mistake, contact support@codebuff.com. Press
                Ctrl+C to exit.
              </text>
            </>
          )}

          {/* Shared free-session quota exhausted. Terminal for this run —
              the user can exit and come
              back once the daily Pacific reset passes. */}
          {session?.status === 'rate_limited' && (
            <>
              <text style={{ fg: theme.secondary, marginBottom: 1 }}>
                ⚠ Session limit reached
              </text>
              <text style={{ fg: theme.muted, wrapMode: 'word' }}>
                You've used{' '}
                <span fg={theme.foreground}>
                  {formatSessionUnits(session.recentCount)} of {session.limit}
                </span>{' '}
                sessions{' '}
                today. Try again in{' '}
                <span fg={theme.foreground}>
                  {formatRetryAfter(session.retryAfterMs)}
                </span>
                . Press Ctrl+C to exit.
              </text>
            </>
          )}
        </box>
      </box>

      {/* Reserve the ad banner slot before the async ad fetch resolves so the
          waiting-room content does not jump when the banner fills. On very
          short terminals the banner is dropped entirely to give the picker
          back its 5 rows. */}
      {showAds && (
        <box
          style={{
            width: '100%',
            flexShrink: 0,
            height: AD_CARD_HEIGHT,
          }}
        >
          {ads ? (
            <ChoiceAdBanner
              ads={ads}
              onClick={recordClick}
              onImpression={recordImpression}
            />
          ) : (
            <text style={{ fg: theme.muted }}>
              {'─'.repeat(terminalWidth)}
            </text>
          )}
        </box>
      )}
    </box>
  )
}
