import { TextAttributes } from '@opentui/core'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { COPIED_RESET_DELAY_MS } from './copy-button'
import { FREEBUFF_GLM_V52_MODEL_ID } from '@codebuff/common/constants/freebuff-models'
import { getReferralInfo } from '@codebuff/common/types/freebuff-session'
import { pluralize } from '@codebuff/common/util/string'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTheme } from '../hooks/use-theme'
import { useTimeout } from '../hooks/use-timeout'
import { LOGIN_WEBSITE_URL } from '../login/constants'
import { copyTextToClipboard } from '../utils/clipboard'
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

/**
 * A bordered, button-styled "copy invite link" control. Reads as clickable
 * (rounded border + hover highlight) and flips to an accent "✔ Copied!"
 * confirmation for a couple seconds after a successful copy.
 */
const CopyInviteLinkButton: React.FC<{ link: string; label?: string }> = ({
  link,
  label = '⎘ Copy invite link',
}) => {
  const theme = useTheme()
  const { setTimeout } = useTimeout()
  const [isHovered, setIsHovered] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(link, { suppressGlobalMessage: true })
      setIsCopied(true)
      setIsHovered(false)
      setTimeout('reset-copied', () => setIsCopied(false), COPIED_RESET_DELAY_MS)
    } catch (_error) {
      // copyTextToClipboard already logs and surfaces the failure.
    }
  }, [link, setTimeout])

  const borderColor = isCopied
    ? theme.primary
    : isHovered
      ? theme.foreground
      : theme.border
  const fg = isCopied
    ? theme.primary
    : isHovered
      ? theme.foreground
      : theme.muted

  return (
    <Button
      onClick={handleCopy}
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
  if (accessTier === 'limited') return null

  const referral = getReferralInfo(session)
  if (!referral) return null

  const { qualifiedCount, weeklySessionsRemaining, resetAt, githubLinked } =
    referral
  const link = referralLink(referral.code, referral.referrerName)
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
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>✦ </span>
          {qualifiedCount > 0 ? (
            <>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}>
                {' '}
                — weekly sessions used, resets in {resetsIn}. Refer more:
              </span>
            </>
          ) : (
            <>
              <span fg={theme.muted}>Refer a friend to unlock </span>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}> (limited time):</span>
            </>
          )}
        </text>
        <CopyInviteLinkButton link={link} />
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
            backgroundColor: 'transparent',
          }}
        >
          <text style={{ wrapMode: 'none' }}>
            <span
              fg={joining ? theme.muted : theme.primary}
              attributes={TextAttributes.BOLD}
            >
              {joining ? 'Starting…' : '▶ Use GLM 5.2 ↵'}
            </span>
          </text>
        </Button>
        <CopyInviteLinkButton
          link={link}
          label={`⎘ Invite a friend (${qualifiedCount} joined)`}
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
