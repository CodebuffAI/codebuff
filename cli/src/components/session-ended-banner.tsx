import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { refreshFreebuffSession } from '../hooks/use-freebuff-session'
import { useTheme } from '../hooks/use-theme'
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
 * Enter to re-queue the user; Esc keeps falling through to the global
 * stream-interrupt handler so in-flight work can be cancelled.
 */
export const SessionEndedBanner: React.FC<SessionEndedBannerProps> = ({
  isStreaming,
}) => {
  const theme = useTheme()
  const [rejoining, setRejoining] = useState(false)

  // While a request is still streaming, rejoin is disabled: it would
  // unmount <Chat> and abort the in-flight agent run. The promise is "we
  // let the agent finish" — honoring that means Enter does nothing until
  // the stream ends or the user hits Esc.
  const canRejoin = !isStreaming && !rejoining
  const rejoin = useCallback(() => {
    if (!canRejoin) return
    setRejoining(true)
    // Once the POST lands, the hook flips status to 'queued' and app.tsx
    // swaps us into <WaitingRoomScreen>, unmounting this banner. No need to
    // clear `rejoining` on success — the component will be gone.
    refreshFreebuffSession({ resetChat: true }).catch(() => setRejoining(false))
  }, [canRejoin])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!canRejoin) return
        if (key.name === 'return' || key.name === 'enter') {
          key.preventDefault?.()
          rejoin()
        }
      },
      [rejoin, canRejoin],
    ),
  )

  return (
    <box
      title="Session ended"
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.muted,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <text style={{ fg: theme.foreground, wrapMode: 'word' }}>
        Your freebuff session has ended.
      </text>
      {isStreaming ? (
        <text style={{ fg: theme.muted, wrapMode: 'word' }}>
          Agent is wrapping up. Rejoin the wait room after it's finished.
        </text>
      ) : (
        <Button onClick={rejoin}>
          <text
            style={{ fg: rejoining ? theme.muted : theme.primary }}
            attributes={TextAttributes.BOLD}
          >
            {rejoining ? 'Rejoining…' : 'Press Enter to rejoin waiting room'}
          </text>
        </Button>
      )}
    </box>
  )
}
