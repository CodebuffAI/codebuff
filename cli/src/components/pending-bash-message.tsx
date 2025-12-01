import { TextAttributes } from '@opentui/core'

import { useTheme } from '../hooks/use-theme'
import { DASHED_BORDER_CHARS } from '../utils/ui-constants'
import { TerminalCommandDisplay } from './terminal-command-display'

import type { PendingBashMessage as PendingBashMessageType } from '../state/chat-store'

interface PendingBashMessageProps {
  message: PendingBashMessageType
  width: number
}

export const PendingBashMessage = ({
  message,
  width,
}: PendingBashMessageProps) => {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: 'column',
        width: '100%',
        gap: 0,
        paddingBottom: 1,
      }}
    >
      {/* Ghost message container with dashed border */}
      <box
        style={{
          flexDirection: 'column',
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.muted,
          customBorderChars: DASHED_BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
        }}
      >
        {/* Command output using shared component */}
        <TerminalCommandDisplay
          command={message.command}
          output={message.stdout || message.stderr || null}
          expandable={false}
          maxVisibleLines={10}
          isRunning={message.isRunning}
          cwd={message.cwd}
        />

        {/* Note about pending status */}
        <text fg={theme.muted} attributes={TextAttributes.ITALIC}>
          Will be added to chat history when it completes
        </text>
      </box>
    </box>
  )
}
