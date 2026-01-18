/**
 * Question header component with expand/collapse functionality
 * and answer preview when collapsed
 */

import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'

export interface QuestionHeaderProps {
  questionText: string
  questionPrefix: string
  isExpanded: boolean
  isAnswered: boolean
  answerDisplay: string
  onToggleExpand: () => void
}

export const QuestionHeader: React.FC<QuestionHeaderProps> = memo(
  ({
    questionText,
    questionPrefix,
    isExpanded,
    isAnswered,
    answerDisplay,
    onToggleExpand,
  }) => {
    const theme = useTheme()

    return (
      <Button
        onClick={onToggleExpand}
        style={{
          flexDirection: 'column',
          width: '100%',
        }}
      >
        <text>
          <span fg={theme.muted}>{isExpanded ? '▼' : '▶'}</span>
          <span
            fg={theme.foreground}
            attributes={isExpanded ? TextAttributes.BOLD : undefined}
          >
            {' '}
            {questionPrefix}
            {questionText}
          </span>
        </text>
        {/* Answer displayed on separate line when collapsed (like User Answers style) */}
        {!isExpanded && (
          <text style={{ marginLeft: 3 }}>
            <span fg={theme.primary}>↳ </span>
            <span
              fg={isAnswered ? theme.primary : theme.muted}
              attributes={TextAttributes.ITALIC}
            >
              {isAnswered ? `"${answerDisplay}"` : '(click to answer)'}
            </span>
          </text>
        )}
      </Button>
    )
  },
)

QuestionHeader.displayName = 'QuestionHeader'
