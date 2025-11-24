/**
 * Question header component showing progress and navigation hints
 */

import React from 'react'
import { useTheme } from '../../../hooks/use-theme'
import { ProgressIndicator } from './progress-indicator'
import { SkipButton } from './skip-button'

export interface QuestionHeaderProps {
  currentIndex: number
  totalQuestions: number
  answeredStates: boolean[]
  allAnswered: boolean
  onSkip?: () => void
  skipButtonFocused?: boolean
  skipButtonHovered?: boolean
  onSkipMouseOver?: () => void
  onSkipMouseOut?: () => void
  hasRoomForInlineButtons: boolean
}

export const QuestionHeader: React.FC<QuestionHeaderProps> = ({
  currentIndex,
  totalQuestions,
  answeredStates,
  allAnswered,
  onSkip,
  skipButtonFocused = false,
  skipButtonHovered = false,
  onSkipMouseOver,
  onSkipMouseOut,
  hasRoomForInlineButtons,
}) => {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 1,
      }}
    >
      {/* Left side: Question counter and progress */}
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <box style={{ flexDirection: 'row', gap: 0 }}>
          <text style={{ fg: theme.secondary }}>
            Question {currentIndex + 1} of {totalQuestions}
          </text>
          {totalQuestions > 1 && (
            <text style={{ fg: theme.muted }}> (← → to navigate)</text>
          )}
        </box>
        {totalQuestions > 1 && (
          <ProgressIndicator
            currentIndex={currentIndex}
            answeredStates={answeredStates}
            allAnswered={allAnswered}
          />
        )}
      </box>

      {/* Right side: Skip button (if room) */}
      {hasRoomForInlineButtons && onSkip && (
        <box style={{ flexDirection: 'row', gap: 2 }}>
          <SkipButton
            onClick={onSkip}
            isFocused={skipButtonFocused}
            isHovered={skipButtonHovered}
            onMouseOver={onSkipMouseOver}
            onMouseOut={onSkipMouseOut}
          />
        </box>
      )}
    </box>
  )
}
