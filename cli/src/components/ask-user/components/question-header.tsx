/**
 * Question header component showing progress and navigation hints
 */

import { TextAttributes } from '@opentui/core'
import React from 'react'

import { ProgressIndicator } from './progress-indicator'
import { useTheme } from '../../../hooks/use-theme'
import { BORDER_CHARS } from '../../../utils/ui-constants'
import { Button } from '../../button'

export interface QuestionHeaderProps {
  currentIndex: number
  totalQuestions: number
  answeredStates: boolean[]
  isOnConfirmScreen?: boolean
  onNavigate?: (index: number) => void
  onNavigateToConfirm?: () => void
  onPrev?: () => void
  onNext?: () => void
}

export const QuestionHeader: React.FC<QuestionHeaderProps> = ({
  currentIndex,
  answeredStates,
  isOnConfirmScreen = false,
  onNavigate,
  onNavigateToConfirm,
  onPrev,
  onNext,
}) => {
  const theme = useTheme()
  const isFirstQuestion = currentIndex === 0 && !isOnConfirmScreen
  const isLastQuestion = isOnConfirmScreen

  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 1,
        alignItems: 'center',
        marginBottom: 1,
      }}
    >
      {/* Left arrow */}
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
      
      {/* Progress breadcrumbs */}
      <ProgressIndicator
        currentIndex={currentIndex}
        answeredStates={answeredStates}
        isOnConfirmScreen={isOnConfirmScreen}
        onNavigate={onNavigate}
        onNavigateToConfirm={onNavigateToConfirm}
      />
      
      {/* Right arrow */}
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
    </box>
  )
}
