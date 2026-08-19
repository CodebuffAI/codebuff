import {
  FREEBUFF_EARN_PATH,
  FREEBUFF_EARN_PROMPT_SHORT,
} from '@codebuff/common/constants/freebuff-levels'
import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from './button'
import { useCopyToClipboard } from './copy-button'
import { FREEBUFF_GLM_V52_MODEL_ID } from '@codebuff/common/constants/freebuff-models'
import { REFERRAL_CLI_DAILY_SESSION_BONUS_CAP } from '@codebuff/common/constants/freebuff-referral-tiers'
import { pluralize } from '@codebuff/common/util/string'

import { startFreebuffSession } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useTheme } from '../hooks/use-theme'
import { LOGIN_WEBSITE_URL } from '../login/constants'
import { formatFreebuffPremiumResetCountdown } from '../utils/freebuff-premium-reset'
import { safeOpen } from '../utils/open-url'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type {
  FreebuffGlmPromo,
  FreebuffReferralInfo,
} from '@codebuff/common/types/freebuff-session'

/** Build a friend's share link from the referral code. Points at the
 *  /get-started page (CLI install walkthrough + hero + FAQs) rather than the
 *  bare landing page; the `?ref=` code is still captured into the attribution
 *  cookie there via the root layout's ReferralCodeCapture. When we know the
 *  inviter's name we pass `?referrer=` too so the page greets the friend with
 *  "X invited you to try Freebuff!". */
function referralLink(code: string, referrerName: string | null): string {
  const params = new URLSearchParams({ ref: code })
  if (referrerName) params.set('referrer', referrerName)
  return `${LOGIN_WEBSITE_URL}/get-started?${params.toString()}`
}

/**
 * The Earn page, on the tab that pays TODAY.
 *
 * Was `/earn?tab=referrals#referral-status`, which sent a rate-limited user to
 * the slowest of the three ways to earn — a referral pays when somebody else
 * signs up and sticks around. `/earn/trust` is the engagement feed, which pays
 * within a minute. `FREEBUFF_EARN_PATH` is shared so the CLI, Desktop and the
 * browser all point at the same place.
 */
const EARN_URL = `${LOGIN_WEBSITE_URL}${FREEBUFF_EARN_PATH}`
const DASHBOARD_LABEL = `${FREEBUFF_EARN_PROMPT_SHORT} ↵`
// Two columns of leading space separate the label from the copy control beside
// it (the row itself has no gap), and they stay put in every state so keyboard
// navigation never shifts the rest of the action row.
const DASHBOARD_GUTTER = '  '
const DASHBOARD_BUTTON_WIDTH = DASHBOARD_LABEL.length + DASHBOARD_GUTTER.length

/** The temporary promo still needs its deadline even though the standing
 * bounty pitch is already covered elsewhere in the picker and Earn page. */
function BountyPromoLine({
  theme,
  promo,
}: {
  theme: ReturnType<typeof useTheme>
  promo?: FreebuffGlmPromo
}) {
  if (!promo) return null
  return (
    <text style={{ wrapMode: 'word' }}>
      <span fg={theme.success ?? theme.foreground}>
        ✦ Promo: earn a bounty, spend up to {promo.dailySessions} a day
      </span>
      <span fg={theme.muted}> (ends {formatPromoEnd(promo.endsAt)})</span>
    </text>
  )
}

function DashboardButton({
  theme,
  focused,
  onOpen,
}: {
  theme: ReturnType<typeof useTheme>
  focused: boolean
  onOpen: () => void
}) {
  // Focus is shown by the accent color alone, like the inline copy control it
  // sits next to. A leading marker would have to eat the gutter that keeps the
  // two labels apart, so a focused dashboard link ran flush into "Copy invite
  // link" and read as overlapping it.
  return (
    <Button onClick={onOpen}>
      <text style={{ wrapMode: 'word' }}>
        <span
          fg={focused ? theme.primary : theme.secondary}
          attributes={focused ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {DASHBOARD_GUTTER}
          {DASHBOARD_LABEL}
        </span>
      </text>
    </Button>
  )
}

/** Short, local date for the promo's end. The server sends the instant; every
 * surface formats it, so none of them can drift from the real window. */
function formatPromoEnd(endsAt: string): string {
  const at = new Date(endsAt)
  return Number.isNaN(at.getTime())
    ? 'soon'
    : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Navigation ids for the banner's keyboard-focusable buttons. The model
// selector owns the landing keyboard handler and appends these after its rows.
const COPY_FOCUS_ID = '__freebuff_referral_copy__'
const GLM_FOCUS_ID = '__freebuff_referral_glm__'
/** Opens the Earn page — bounties to claim, referrals to track, balance to
 *  read. The CLI can open a browser (`safeOpen`), so this is a real button
 *  rather than a URL the user has to select and paste. */
const DASHBOARD_FOCUS_ID = '__freebuff_referral_dashboard__'
const BUTTON_HORIZONTAL_CHROME = 6 // two border + four padding columns

export interface FreebuffReferralFocusTarget {
  id: string
  activate: () => void
}

/** Below this menu width, the model action and referral/dashboard action group
 * no longer fit beside each other. */
const shouldStackFreebuffReferralActions = (width: number): boolean =>
  width < 70

const firstLabelThatFits = (
  availableWidth: number,
  labels: readonly string[],
  chrome: number = BUTTON_HORIZONTAL_CHROME,
): string =>
  labels.find((label) => label.length + chrome <= availableWidth) ??
  labels.at(-1)!

/**
 * A "copy invite link" control, in one of two weights. Flips to an accent
 * "✔ Copied!" confirmation for a couple seconds after a successful copy in
 * both. Presentational: the copy action and copied flag are owned by the
 * banner so the same action can be fired by keyboard navigation from the
 * model picker.
 *
 *   - 'bordered' — a rounded box that reads as a button. Used inside the
 *     unlocked GLM card, where it sits beside the "Use GLM 5.2 ↵" button and
 *     has to match it.
 *   - 'inline' — no box; focus/hover shown by color alone, exactly like the
 *     picker's "See all N models" toggle. Used in the two LOCKED states,
 *     which render on the landing screen directly under the recommended card:
 *     a second bordered box there competes with the hero for the eye, and the
 *     hero is what Enter actually does. Sits one row down (like the toggle) so
 *     whitespace, not a border, separates it from the pitch above — and rests
 *     at `foreground` rather than `muted`, since unlike the toggle it is
 *     adjacent to muted body copy it must not blend into.
 */
const CopyInviteLinkButton: React.FC<{
  isCopied: boolean
  focused: boolean
  onCopy: () => void
  availableWidth: number
  labels?: readonly string[]
  variant?: 'bordered' | 'inline'
}> = ({
  isCopied,
  focused,
  onCopy,
  availableWidth,
  labels = ['⎘ Copy invite link', '⎘ Copy link', '⎘ Copy'],
  variant = 'bordered',
}) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const inline = variant === 'inline'
  // Borderless labels spend no columns on chrome, so they fit at widths the
  // boxed variant would have had to abbreviate at.
  const chrome = inline ? 0 : BUTTON_HORIZONTAL_CHROME
  const label = firstLabelThatFits(availableWidth, labels, chrome)
  const copiedLabel = firstLabelThatFits(
    availableWidth,
    ['✔ Copied!', '✔'],
    chrome,
  )
  const highlighted = isCopied || focused || isHovered

  if (inline) {
    return (
      <Button
        id={COPY_FOCUS_ID}
        onClick={onCopy}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        style={{ flexShrink: 0 }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span
            fg={highlighted ? theme.primary : theme.foreground}
            attributes={
              isCopied || focused ? TextAttributes.BOLD : TextAttributes.NONE
            }
          >
            {isCopied ? copiedLabel : label}
          </span>
        </text>
      </Button>
    )
  }

  // Keyboard focus and mouse hover share the highlighted look; a keyboard-
  // focused row gets the brighter accent border so it matches the picker's
  // focused-row treatment above it.
  const borderColor = isCopied
    ? theme.primary
    : focused
      ? theme.primary
      : isHovered
        ? theme.foreground
        : theme.border
  const fg = isCopied
    ? theme.primary
    : focused || isHovered
      ? theme.foreground
      : theme.muted

  return (
    <Button
      id={COPY_FOCUS_ID}
      onClick={onCopy}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
      border
      borderStyle="rounded"
      borderColor={borderColor}
      customBorderChars={BORDER_CHARS}
      style={{
        paddingLeft: 2,
        paddingRight: 2,
        backgroundColor: 'transparent',
        // Hug the label and never let a width-constrained row squash the
        // bordered box (which would clip the label and mangle the border).
        flexShrink: 0,
      }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span fg={fg}>{isCopied ? copiedLabel : label}</span>
      </text>
    </Button>
  )
}

/**
 * Advertises the "invite friends" reward on the landing model screen. The
 * reward — and the presentation — depends on the session's access tier:
 *
 *   - LIMITED tier: referrals earn a daily free-session bonus (not GLM). One
 *     quiet muted line ("refer friends → more sessions per day") + the inline
 *     copy control, so it advertises the perk without crowding the picker.
 *   - FULL tier, UNLOCKED (you have GLM sessions today): a flashy accent-
 *     bordered card with your remaining sessions and a prominent "Use GLM 5.2 ↵"
 *     launch button, so the reward feels earned and inviting.
 *   - FULL tier, LOCKED (no GLM sessions yet): a single quiet muted line
 *     inviting referrals.
 *
 * Both LOCKED states render on the landing screen under the recommended model
 * card, so their copy control is borderless — the hero card stays the only
 * bordered element there. The UNLOCKED card is a screen of its own making: the
 * reward is earned, so it gets a box and boxed buttons.
 *
 * Every locked-state pitch is sized to fit its tier's card width on ONE line
 * (the banner wraps at `buttonOuterWidth`, not the terminal width) and ends
 * in a colon that hands off to the inline copy control below it. Now that the
 * control is borderless it no longer announces itself as a button, so the
 * colon is what carries the eye down to it. The one exception is the
 * limited-tier at-cap line: referring more earns nothing there, so it ends
 * flat rather than pointing at an action that would not pay off.
 *
 * Renders nothing unless the server attached a `referral` block, so
 * pre-referral-code users never see it.
 */
interface FreebuffReferralBannerProps {
  width: number
  referral: FreebuffReferralInfo
  /** A live GLM promo, or undefined. Undefined is the ordinary state. */
  glmPromo?: FreebuffGlmPromo
  accessTier: FreebuffAccessTier
  focusedId: string
  onFocusTargetsChange: (targets: FreebuffReferralFocusTarget[]) => void
}

export const FreebuffReferralBanner: React.FC<FreebuffReferralBannerProps> = ({
  width,
  referral,
  glmPromo,
  accessTier,
  focusedId,
  onFocusTargetsChange,
}) => {
  const theme = useTheme()
  const now = useNow(60_000)
  const [joining, setJoining] = useState(false)
  const joiningRef = useRef(false)
  const [glmHovered, setGlmHovered] = useState(false)
  const copyFocused = focusedId === COPY_FOCUS_ID
  const glmFocused = focusedId === GLM_FOCUS_ID
  const dashboardFocused = focusedId === DASHBOARD_FOCUS_ID

  const useGlm = useCallback(() => {
    if (joiningRef.current) return
    joiningRef.current = true
    setJoining(true)
    startFreebuffSession(FREEBUFF_GLM_V52_MODEL_ID).finally(() => {
      joiningRef.current = false
      setJoining(false)
    })
  }, [])

  const link = referralLink(referral.code, referral.referrerName)
  const { isCopied, copy } = useCopyToClipboard(link)

  // Register this banner's buttons as keyboard focus targets so the model
  // selector's arrow navigation flows from "see all models" into them (and
  // wraps back up). Locked states show copy then dashboard; the unlocked card
  // leads with "Use GLM 5.2", then copy and dashboard.
  // A limited-tier user can now hold GLM sessions too — bounty grants are
  // redeemable in every region — so the unlocked card is keyed on the balance
  // alone rather than on the tier.
  const isLocked = (referral.weeklySessionsRemaining ?? 0) <= 0
  const openDashboard = useCallback(() => {
    void safeOpen(EARN_URL)
  }, [])
  const lockedReferralActions = (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
        marginTop: 1,
        flexShrink: 0,
      }}
    >
      <CopyInviteLinkButton
        isCopied={isCopied}
        focused={copyFocused}
        onCopy={copy}
        availableWidth={Math.max(0, width - DASHBOARD_BUTTON_WIDTH)}
        variant="inline"
      />
      <DashboardButton
        theme={theme}
        focused={dashboardFocused}
        onOpen={openDashboard}
      />
    </box>
  )

  useEffect(() => {
    onFocusTargetsChange(
      isLocked
        ? [
            { id: COPY_FOCUS_ID, activate: copy },
            { id: DASHBOARD_FOCUS_ID, activate: openDashboard },
          ]
        : [
            { id: GLM_FOCUS_ID, activate: useGlm },
            { id: COPY_FOCUS_ID, activate: copy },
            { id: DASHBOARD_FOCUS_ID, activate: openDashboard },
          ],
    )
    return () => onFocusTargetsChange([])
  }, [isLocked, copy, useGlm, openDashboard, onFocusTargetsChange])

  const { qualifiedCount, githubLinked } = referral

  // LIMITED tier: referrals earn a daily free-session bonus, not GLM. Keep it
  // quiet — one line advertising the perk + the share button below it, with the
  // earned bonus (capped) shown as progress. `qualifiedCount` is the capped
  // bonus sessions/day already earned.
  // ...unless they hold bounty-earned GLM sessions, which fall through to the
  // shared unlocked card below.
  if (accessTier === 'limited' && isLocked) {
    const atCap = qualifiedCount >= REFERRAL_CLI_DAILY_SESSION_BONUS_CAP
    return (
      <box
        style={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          marginTop: 1,
          // Never let a height-starved landing column squash the banner — that
          // would draw the copy control on top of the pitch line above it.
          flexShrink: 0,
        }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>✦ </span>
          {qualifiedCount > 0 ? (
            <>
              <span fg={theme.foreground}>
                +{pluralize(qualifiedCount, 'session')}/day
              </span>
              <span fg={theme.muted}>
                {' '}
                from referrals
                {atCap
                  ? ''
                  : ` · refer more (${qualifiedCount}/${REFERRAL_CLI_DAILY_SESSION_BONUS_CAP}):`}
              </span>
            </>
          ) : (
            <span fg={theme.muted}>
              Refer friends to unlock more free sessions per day:
            </span>
          )}
        </text>
        {lockedReferralActions}
        <BountyPromoLine theme={theme} promo={glmPromo} />
      </box>
    )
  }

  // FULL tier: GLM 5.2 reward. The GLM-only fields are always present on a
  // full-tier block from the server; default defensively for the wire type.
  const weeklySessionsRemaining = referral.weeklySessionsRemaining ?? 0
  const resetsIn = formatFreebuffPremiumResetCountdown(
    referral.resetAt ? new Date(referral.resetAt) : new Date(now),
    now,
    {
      withDays: true,
    },
  )

  // NOT USABLE: keep it quiet — one line that advertises the reward, with the
  // share link as a clearly-clickable button below it. Message adapts to *why*
  // it's locked — no referrals yet vs. today's sessions already spent.
  if (weeklySessionsRemaining <= 0) {
    return (
      <box
        style={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          marginTop: 1,
          // Never let a height-starved landing column squash the banner — that
          // would draw the copy control on top of the pitch line above it.
          flexShrink: 0,
        }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>✦ </span>
          {qualifiedCount > 0 ? (
            <>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}>
                {' '}
                refills in {resetsIn} · refer more ({qualifiedCount} earned):
              </span>
            </>
          ) : (
            <>
              <span fg={theme.muted}>Refer friends → </span>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}>, top open-source model:</span>
            </>
          )}
        </text>
        {lockedReferralActions}
        <BountyPromoLine theme={theme} promo={glmPromo} />
      </box>
    )
  }

  // USABLE: flashy accent card. Round the (possibly fractional) remaining up to
  // whole sessions for a clean count — an early-ended session leaves a fraction
  // that the user can still spend, so never show 0 here.
  const sessionsLeft = Math.max(1, Math.ceil(weeklySessionsRemaining))
  const stackActions = shouldStackFreebuffReferralActions(width)
  const actionRowWidth = width - 4 // card border + horizontal padding
  const glmLabel = firstLabelThatFits(actionRowWidth, [
    '▶ Use GLM 5.2 ↵',
    '▶ GLM 5.2',
    '▶ GLM',
  ])
  const inviteAvailableWidth = stackActions
    ? actionRowWidth - DASHBOARD_BUTTON_WIDTH
    : actionRowWidth -
      (glmLabel.length + BUTTON_HORIZONTAL_CHROME) -
      2 -
      DASHBOARD_BUTTON_WIDTH
  // No "max earned" state: the reward is uncapped, so inviting always adds
  // another daily session.
  const inviteLabels = [
    `⎘ Invite for +1/day (${qualifiedCount} earned)`,
    '⎘ Invite +1/day',
    '⎘ Invite',
  ]
  const githubLabel =
    actionRowWidth >=
    'Signed up with Google? Connect GitHub to qualify ↗'.length
      ? 'Signed up with Google? Connect GitHub to qualify ↗'
      : 'Connect GitHub to qualify ↗'

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
        borderStyle: 'rounded',
        borderColor: theme.muted,
        marginTop: 1,
        width,
        // Never let a height-starved landing column squash the card — that
        // would draw the bordered action buttons on top of the status line.
        flexShrink: 0,
      }}
      border={['top', 'bottom', 'left', 'right']}
      title=" ✦ GLM 5.2 unlocked "
      titleAlignment="left"
    >
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {pluralize(sessionsLeft, 'session')}
        </span>
        <span fg={theme.foreground}> available today</span>
        <span fg={theme.muted}> · resets in {resetsIn}</span>
      </text>

      <box
        style={{
          flexDirection: stackActions ? 'column' : 'row',
          alignItems: stackActions ? 'flex-start' : 'center',
          gap: stackActions ? 0 : 2,
        }}
      >
        <Button
          id={GLM_FOCUS_ID}
          onClick={useGlm}
          onMouseOver={() => setGlmHovered(true)}
          onMouseOut={() => setGlmHovered(false)}
          border
          borderStyle="rounded"
          // Standard button treatment: muted border at rest, green when
          // keyboard-focused, brighter on hover — same scheme as the
          // "Copy invite link" button below it.
          borderColor={
            glmFocused
              ? theme.primary
              : glmHovered
                ? theme.foreground
                : theme.border
          }
          customBorderChars={BORDER_CHARS}
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            backgroundColor: 'transparent',
          }}
        >
          <text style={{ wrapMode: 'none' }}>
            <span
              fg={
                joining
                  ? theme.muted
                  : glmFocused || glmHovered
                    ? theme.foreground
                    : theme.muted
              }
              attributes={TextAttributes.BOLD}
            >
              {joining ? 'Starting…' : glmLabel}
            </span>
          </text>
        </Button>
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
            flexShrink: 0,
          }}
        >
          <CopyInviteLinkButton
            isCopied={isCopied}
            focused={copyFocused}
            onCopy={copy}
            availableWidth={inviteAvailableWidth}
            labels={inviteLabels}
          />
          <DashboardButton
            theme={theme}
            focused={dashboardFocused}
            onOpen={openDashboard}
          />
        </box>
      </box>

      <BountyPromoLine theme={theme} promo={glmPromo} />

      {!githubLinked && (
        <Button
          onClick={() => void safeOpen(`${LOGIN_WEBSITE_URL}/web/settings`)}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.secondary}>{githubLabel}</span>
          </text>
        </Button>
      )}
    </box>
  )
}
