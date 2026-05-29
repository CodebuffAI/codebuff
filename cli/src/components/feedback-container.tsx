import React from 'react'

import { BORDER_CHARS } from '../utils/ui-constants'

import type { MultilineInputHandle } from './multiline-input'

interface FeedbackContainerProps {
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  onExitFeedback: () => void
  width: number
}

export const FeedbackContainer: React.FC<FeedbackContainerProps> = ({
  inputRef: _inputRef,
  onExitFeedback: _onExitFeedback,
  width,
}) => {
  // Feedback is disabled in Openbuff local mode — no cloud backend.
  // The exit is handled by chat.tsx keyboard shortcuts.

  return (
    <box
      style={{
        width,
        borderStyle: 'single',
        borderColor: 'yellow',
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <text>Feedback is not available in Openbuff local mode.</text>
      <text>Press Esc to continue</text>
    </box>
  )
}