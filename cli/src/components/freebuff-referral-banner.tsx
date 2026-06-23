import { TextAttributes } from '@opentui/core'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { CopyButton } from './copy-button'
import { FREEBUFF_GLM_V52_MODEL_ID } from '@codebuff/common/constants/freebuff-models'
import { getReferralInfo } from '@codebuff/common/types/freebuff-session'
import { pluralize } from '@codebuff/common/util/string'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTheme } from '../hooks/use-theme'
import { LOGIN_WEBSITE_URL } from '../login/constants'
import { formatFreebuffPremiumResetCountdown } from '../utils/freebuff-premium-reset'
import { safeOpen } from '../utils/open-url'

/** Build a friend's share link from the referral code. */
function referralLink(code: string): string {
  return `${LOGIN_WEBSITE_URL}/?ref=${encodeURIComponent(code)}`
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

  const referral = getReferralInfo(session)
  if (!referral) return null

  const { qualifiedCount, weeklySessionsRemaining, resetAt, githubLinked } =
    referral
  const link = referralLink(referral.code)
  const resetsIn = formatFreebuffPremiumResetCountdown(new Date(resetAt), now, {
    withDays: true,
  })

  // NOT USABLE: keep it to one unobtrusive row that still advertises the reward
  // and the share link. Message adapts to *why* it's locked — no referrals yet
  // vs. this week's sessions already spent.
  if (weeklySessionsRemaining <= 0) {
    return (
      <box
        style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 1 }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>✦ </span>
          {qualifiedCount > 0 ? (
            <>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}>
                {' '}
                — weekly sessions used, resets in {resetsIn} —{' '}
              </span>
            </>
          ) : (
            <>
              <span fg={theme.muted}>Refer friends to unlock </span>
              <span fg={theme.foreground}>GLM 5.2</span>
              <span fg={theme.muted}> (limited time) — </span>
            </>
          )}
        </text>
        <CopyButton textToCopy={link} leadingSpace={false}>
          <span fg={theme.primary}>copy invite link </span>
        </CopyButton>
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

      <box style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 3 }}>
        <Button onClick={useGlm}>
          <text style={{ wrapMode: 'none' }}>
            <span
              fg={joining ? theme.muted : theme.primary}
              attributes={TextAttributes.BOLD}
            >
              {joining ? ' Starting… ' : ' ▶ Use GLM 5.2 ↵ '}
            </span>
          </text>
        </Button>
        <CopyButton textToCopy={link} leadingSpace={false}>
          <span fg={theme.muted}>
            invite a friend ({qualifiedCount} joined){' '}
          </span>
        </CopyButton>
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

      {/* Sets expectations that the perk is promotional and can be wound down
          (see FREEBUFF_GLM_V52_REFERRAL_ENABLED) without feeling like a rug-pull. */}
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.muted} attributes={TextAttributes.DIM}>
          Limited-time perk · access may end anytime
        </span>
      </text>
    </box>
  )
}
