/**
 * Question header component showing progress and navigation hints
 */

import React from 'react'
import { TextAttributes } from '@opentui/core'
import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { BORDER_CHARS } from '../../../utils/ui-constants'
import { ProgressIndicator } from './progress-indicator'
import { SkipButton } from './skip-button'

export interface QuestionHeaderProps {
  currentIndex: number
  totalQuestions: number
  answeredStates: boolean[]
  allAnswered: boolean
  isOnConfirmScreen?: boolean
  onSkip?: () => void
  onNavigate?: (index: number) => void
  onNavigateToConfirm?: () => void
  onPrev?: () => void
  onNext?: () => void
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
  isOnConfirmScreen = false,
  onSkip,
  onNavigate,
  onNavigateToConfirm,
  onPrev,
  onNext,
  skipButtonFocused = false,
  skipButtonHovered = false,
  onSkipMouseOver,
  onSkipMouseOut,
  hasRoomForInlineButtons,
}) => {
  const theme = useTheme()
  const isFirstQuestion = currentIndex === 0 && !isOnConfirmScreen
  const isLastQuestion = isOnConfirmScreen || (currentIndex === totalQuestions - 1 && !allAnswered)

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
            {isOnConfirmScreen ? 'Ready to submit' : `Question ${currentIndex + 1} of ${totalQuestions}`}
          </text>
        </box>
        {totalQuestions > 1 && (
          <ProgressIndicator
            currentIndex={currentIndex}
            answeredStates={answeredStates}
            allAnswered={allAnswered}
            isOnConfirmScreen={isOnConfirmScreen}
            onNavigate={onNavigate}
            onNavigateToConfirm={onNavigateToConfirm}
          />
        )}
      </box>

      {/* Right side: Navigation and Skip buttons (if room) */}
      {hasRoomForInlineButtons && (
        <box style={{ flexDirection: 'row', gap: 1 }}>
          {/* Navigation buttons (only show for multi-question forms) */}
          {totalQuestions > 1 && (
            <>
              <Button
                onClick={onPrev}
                style={{
                  borderStyle: 'single',
                  borderColor: isFirstQuestion ? theme.muted : theme.secondary,
                  customBorderChars: BORDER_CHARS,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text
                  style={{
                    fg: isFirstQuestion ? theme.muted : theme.foreground,
                    attributes: isFirstQuestion ? undefined : TextAttributes.BOLD,
                  }}
                >
                  ←
                </text>
              </Button>
              <Button
                onClick={onNext}
                style={{
                  borderStyle: 'single',
                  borderColor: isLastQuestion ? theme.muted : theme.secondary,
                  customBorderChars: BORDER_CHARS,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text
                  style={{
                    fg: isLastQuestion ? theme.muted : theme.foreground,
                    attributes: isLastQuestion ? undefined : TextAttributes.BOLD,
                  }}
                >
                  →
                </text>
              </Button>
            </>
          )}
          {onSkip && (
            <SkipButton
              onClick={onSkip}
              isFocused={skipButtonFocused}
              isHovered={skipButtonHovered}
              onMouseOver={onSkipMouseOver}
              onMouseOut={onSkipMouseOut}
            />
          )}
        </box>
      )}
    </box>
  )
}
