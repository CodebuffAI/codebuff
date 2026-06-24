import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useState } from 'react'

import { Button } from './button'
import { useCopyToClipboard } from './copy-button'
import {
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_GLM_V52_REFERRAL_CAP,
} from '@codebuff/common/constants/freebuff-models'
import { getReferralInfo } from '@codebuff/common/types/freebuff-session'
import { pluralize } from '@codebuff/common/util/string'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useFreebuffLandingFocusStore } from '../state/freebuff-landing-focus-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTheme } from '../hooks/use-theme'
import { LOGIN_WEBSITE_URL } from '../login/constants'
import { formatFreebuffPremiumResetCountdown } from '../utils/freebuff-premium-reset'
import { safeOpen } from '../utils/open-url'
import { BORDER_CHARS } from '../utils/ui-constants'

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

// Navigation ids for the banner's keyboard-focusable buttons. The model
// selector owns the landing keyboard handler and reaches these via the shared
// landing-focus store (arrow down past "see all models" → these buttons).
const COPY_FOCUS_ID = '__freebuff_referral_copy__'
const GLM_FOCUS_ID = '__freebuff_referral_glm__'

/**
 * A bordered, button-styled "copy invite link" control. Reads as clickable
 * (rounded border + hover/keyboard-focus highlight) and flips to an accent
 * "✔ Copied!" confirmation for a couple seconds after a successful copy.
 * Presentational: the copy action and copied flag are owned by the banner so
 * the same action can be fired by keyboard navigation from the model picker.
 */
const CopyInviteLinkButton: React.FC<{
  isCopied: boolean
  focused: boolean
  onCopy: () => void
  label?: string
}> = ({ isCopied, focused, onCopy, label = '⎘ Copy invite link' }) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)
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
        <span fg={fg}>{isCopied ? '✔ Copied!' : label}</span>
      </text>
    </Button>
  )
}

/**
 * Advertises GLM 5.2 on the waiting-room model screen — a hyped model you unlock
 * by referring friends. Two deliberately different presentations:
 *
 *   - UNLOCKED (you have weekly GLM sessions): a flashy accent-bordered card
 *     with your remaining sessions and a prominent "Use GLM 5.2 ↵" launch
 *     button, so the reward feels earned and inviting.
 *   - LOCKED (no sessions yet): a single quiet muted line inviting referrals,
 *     so it advertises the perk without crowding the model picker.
 *
 * Renders nothing unless the server attached a `referral` block (full-tier
 * only), so limited-tier and pre-referral-code users never see it.
 */
export const FreebuffReferralBanner: React.FC = () => {
  const theme = useTheme()
  const session = useFreebuffSessionStore((s) => s.session)
  const now = useNow(60_000)
  const [joining, setJoining] = useState(false)
  // Whether the model selector's mirrored cursor (it owns the landing keyboard
  // handler) currently sits on one of this banner's buttons. Selecting the
  // booleans rather than the raw id means arrowing among the model rows above
  // doesn't re-render the banner — only crossing into/out of its buttons does.
  const copyFocused = useFreebuffLandingFocusStore(
    (s) => s.focusedId === COPY_FOCUS_ID,
  )
  const glmFocused = useFreebuffLandingFocusStore(
    (s) => s.focusedId === GLM_FOCUS_ID,
  )
  const setExtraTargets = useFreebuffLandingFocusStore((s) => s.setExtraTargets)

  const useGlm = useCallback(() => {
    setJoining((wasJoining) => {
      if (wasJoining) return wasJoining
      joinFreebuffQueue(FREEBUFF_GLM_V52_MODEL_ID).finally(() =>
        setJoining(false),
      )
      return true
    })
  }, [])

  // Referrals are a full-tier-only perk: limited users never earn GLM sessions,
  // so the whole banner is hidden for them. The server already omits the
  // `referral` block for non-full tiers; this is a belt-and-suspenders guard.
  const accessTier =
    session && 'accessTier' in session ? session.accessTier : 'full'
  const referral = getReferralInfo(session)
  const link = referral
    ? referralLink(referral.code, referral.referrerName)
    : ''
  const { isCopied, copy } = useCopyToClipboard(link)

  // Register this banner's buttons as keyboard focus targets so the model
  // selector's arrow navigation flows from "see all models" into them (and
  // wraps back up). Locked state shows just the copy button; the unlocked card
  // leads with "Use GLM 5.2" then the invite button.
  const hidden = accessTier === 'limited' || !referral
  const isLocked = (referral?.weeklySessionsRemaining ?? 0) <= 0
  useEffect(() => {
    if (hidden) {
      setExtraTargets([])
      return
    }
    setExtraTargets(
      isLocked
        ? [{ id: COPY_FOCUS_ID, activate: copy }]
        : [
            { id: GLM_FOCUS_ID, activate: useGlm },
            { id: COPY_FOCUS_ID, activate: copy },
          ],
    )
    return () => setExtraTargets([])
  }, [hidden, isLocked, copy, useGlm, setExtraTargets])

  if (accessTier === 'limited' || !referral) return null

  const { qualifiedCount, weeklySessionsRemaining, resetAt, githubLinked } =
    referral
  const resetsIn = formatFreebuffPremiumResetCountdown(new Date(resetAt), now, {
    withDays: true,
  })

  // NOT USABLE: keep it quiet — one line that advertises the reward, with the
  // share link as a clearly-clickable button below it. Message adapts to *why*
  // it's locked — no referrals yet vs. this week's sessions already spent.
  if (weeklySessionsRemaining <= 0) {
    return (
      <box
        style={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          marginTop: 1,
        }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>✦ </span>
          {qualifiedCount > 0 ? (
            <>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}>
                {' '}
                — weekly sessions used, resets in {resetsIn}. Refer more (
                {qualifiedCount}/{FREEBUFF_GLM_V52_REFERRAL_CAP}):
              </span>
            </>
          ) : (
            <>
              <span fg={theme.muted}>
                Refer up to {FREEBUFF_GLM_V52_REFERRAL_CAP} friends for more
                sessions of{' '}
              </span>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}>, the most powerful open-source model:</span>
            </>
          )}
        </text>
        <CopyInviteLinkButton
          isCopied={isCopied}
          focused={copyFocused}
          onCopy={copy}
        />
      </box>
    )
  }

  // USABLE: flashy accent card. Round the (possibly fractional) remaining up to
  // whole sessions for a clean count — an early-ended session leaves a fraction
  // that the user can still spend, so never show 0 here.
  const sessionsLeft = Math.max(1, Math.round(weeklySessionsRemaining))

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
        borderStyle: 'rounded',
        borderColor: theme.primary,
        marginTop: 1,
      }}
      border={['top', 'bottom', 'left', 'right']}
      title=" ✦ GLM 5.2 unlocked "
      titleAlignment="left"
    >
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.primary} attributes={TextAttributes.BOLD}>
          {pluralize(sessionsLeft, 'session')}
        </span>
        <span fg={theme.foreground}> available this week</span>
        <span fg={theme.muted}> · resets in {resetsIn}</span>
      </text>

      <box style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Button
          onClick={useGlm}
          border
          borderStyle="rounded"
          borderColor={theme.primary}
          customBorderChars={BORDER_CHARS}
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            // Keyboard focus fills the button so the primary action pops, the
            // same inversion the takeover prompt uses for its focused choice.
            backgroundColor: glmFocused ? theme.primary : 'transparent',
          }}
        >
          <text style={{ wrapMode: 'none' }}>
            <span
              fg={
                joining
                  ? theme.muted
                  : glmFocused
                    ? theme.background
                    : theme.primary
              }
              attributes={TextAttributes.BOLD}
            >
              {joining ? 'Starting…' : '▶ Use GLM 5.2 ↵'}
            </span>
          </text>
        </Button>
        <CopyInviteLinkButton
          isCopied={isCopied}
          focused={copyFocused}
          onCopy={copy}
          label={
            qualifiedCount >= FREEBUFF_GLM_V52_REFERRAL_CAP
              ? `✔ Max sessions earned (${qualifiedCount}/${FREEBUFF_GLM_V52_REFERRAL_CAP})`
              : `⎘ Invite for +1/wk (${qualifiedCount}/${FREEBUFF_GLM_V52_REFERRAL_CAP})`
          }
        />
      </box>

      {!githubLinked && (
        <Button
          onClick={() => void safeOpen(`${LOGIN_WEBSITE_URL}/web/settings`)}
        >
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.secondary}>
              Signed up with Google? Connect GitHub to qualify ↗
            </span>
          </text>
        </Button>
      )}
    </box>
  )
}
