import { getRateLimitsByModel } from '@codebuff/common/types/freebuff-session'
import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import {
  refreshFreebuffSession,
  returnToFreebuffLanding,
} from '../hooks/use-freebuff-session'
import { useTheme } from '../hooks/use-theme'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { formatSessionUnits } from '../utils/format-session-units'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { KeyEvent } from '@opentui/core'

interface SessionEndedBannerProps {
  /** True while an agent request is still streaming under the server-side
   *  grace window. Swaps the Enter-to-rejoin affordance for a "let it
   *  finish" hint so the user doesn't abort their in-flight work. */
  isStreaming: boolean
}

/**
 * Replaces the chat input when the freebuff session has ended. Captures
 * Enter to start a new same-chat session. Esc returns to model selection
 * once no in-flight work needs the global stream-interrupt handler.
 */
export const SessionEndedBanner: React.FC<SessionEndedBannerProps> = ({
  isStreaming,
}) => {
  const theme = useTheme()
  const [pendingAction, setPendingAction] = useState<
    'landing' | 'same-chat' | null
  >(null)

  // All premium models share one daily pool; the server replicates the same
  // snapshot under each premium model id, so the first entry has the right
  // count.
  const premiumQuota = useFreebuffSessionStore(
    (s) => Object.values(getRateLimitsByModel(s.session) ?? {})[0] ?? null,
  )
  const isQuotaExhausted = premiumQuota
    ? premiumQuota.recentCount >= premiumQuota.limit
    : false
  const accessTier = useFreebuffSessionStore((s) =>
    s.session && 'accessTier' in s.session ? s.session.accessTier : 'full',
  )
  const quotaLabel = accessTier === 'limited' ? 'sessions' : 'premium sessions'
  const bannerTitle = premiumQuota
    ? `Session ended  ·  ${formatSessionUnits(premiumQuota.recentCount)} of ${premiumQuota.limit} ${quotaLabel} used today`
    : 'Session ended'
  const landingButtonLabel = 'Change model'
  const landingPendingLabel = 'Opening model selection…'

  // While a request is still streaming, restart is disabled: it would
  // unmount <Chat> and abort the in-flight agent run. The promise is "we
  // let the agent finish" — honoring that means Enter does nothing until
  // the stream ends or the user hits Esc.
  const canRestart = !isStreaming && pendingAction === null
  const pickNewModel = useCallback(() => {
    if (!canRestart) return
    setPendingAction('landing')
    // Drop back to the landing picker (status: 'none') so the user picks a
    // model and hits Enter again to commit, instead of silently starting a
    // new session. app.tsx swaps us into <FreebuffLandingScreen> on the
    // transition, unmounting this banner — no need to clear the pending state on
    // success.
    returnToFreebuffLanding({ resetChat: true }).catch(() =>
      setPendingAction(null),
    )
  }, [canRestart])

  const startSameChatSession = useCallback(() => {
    if (!canRestart) return
    setPendingAction('same-chat')
    // Re-POST with the currently selected model and keep the chat/run state
    // intact so the next prompt continues the same conversation.
    refreshFreebuffSession().catch(() => setPendingAction(null))
  }, [canRestart])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!canRestart) return
        if (isPlainEnterKey(key)) {
          key.preventDefault?.()
          startSameChatSession()
          return
        }
        if (key.name === 'escape') {
          key.preventDefault?.()
          pickNewModel()
        }
      },
      [startSameChatSession, pickNewModel, canRestart],
    ),
  )

  return (
    <box
      title={bannerTitle}
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        // Amber border doubles as the "you've hit the cap" signal now that
        // the quota count lives in the title (which can't carry per-char
        // color); muted otherwise.
        borderColor: isQuotaExhausted ? theme.secondary : theme.muted,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {isStreaming ? (
        <text style={{ fg: theme.muted, wrapMode: 'word' }}>
          Agent is wrapping up. Rejoin the wait room after it's finished.
        </text>
      ) : (
        <box
          style={{
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Button onClick={startSameChatSession}>
            <text
              style={{
                fg:
                  pendingAction === 'same-chat'
                    ? theme.muted
                    : theme.foreground,
              }}
              attributes={TextAttributes.BOLD}
            >
              {pendingAction === 'same-chat'
                ? 'Starting…'
                : 'Press Enter to continue in a new session'}
            </text>
          </Button>
          <box style={{ flexGrow: 1 }} />
          <Button
            onClick={pickNewModel}
            style={{
              borderStyle: 'single',
              borderColor:
                pendingAction === 'landing' ? theme.muted : theme.border,
              customBorderChars: BORDER_CHARS,
              paddingLeft: 1,
              paddingRight: 1,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <text
              style={{
                fg:
                  pendingAction === 'landing'
                    ? theme.muted
                    : theme.foreground,
              }}
            >
              {pendingAction === 'landing' ? (
                landingPendingLabel
              ) : (
                <>
                  {landingButtonLabel}
                  <span fg={theme.muted}>{'   Esc'}</span>
                </>
              )}
            </text>
          </Button>
        </box>
      )}
    </box>
  )
}
