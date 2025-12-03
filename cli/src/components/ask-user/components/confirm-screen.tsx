/**
 * Confirmation screen component for submitting the ask_user form
 * Shown as the final "question" after all questions are answered
 */

import { TextAttributes } from '@opentui/core'
import React from 'react'

import { useTheme } from '../../../hooks/use-theme'
import { BORDER_CHARS } from '../../../utils/ui-constants'
import { Button } from '../../button'

export interface AnswerSummary {
  question: string
  header?: string
  answer: string
}

export interface ConfirmScreenProps {
  onSubmit: () => void
  submitFocused: boolean
  onSubmitMouseOver: () => void
  answers: AnswerSummary[]
}

export const ConfirmScreen: React.FC<ConfirmScreenProps> = ({
  onSubmit,
  submitFocused,
  onSubmitMouseOver,
  answers,
}) => {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'column', gap: 1 }}>
      <text
        style={{
          fg: theme.foreground,
          attributes: TextAttributes.BOLD,
        }}
      >
        Your answers:
      </text>

      {/* Answer summary */}
      <box style={{ flexDirection: 'column', gap: 0, marginTop: 0, paddingLeft: 1 }}>
        {answers.map((item, idx) => (
          <box key={idx} style={{ flexDirection: 'row', gap: 1 }}>
            <text style={{ fg: theme.muted }}>{idx + 1}.</text>
            <text style={{ fg: theme.primary }}>{item.answer}</text>
          </box>
        ))}
      </box>

      <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
        <Button
          onClick={onSubmit}
          onMouseOver={onSubmitMouseOver}
          style={{
            borderStyle: 'single',
            borderColor: submitFocused ? theme.primary : theme.secondary,
            customBorderChars: BORDER_CHARS,
            paddingLeft: 2,
            paddingRight: 2,
            backgroundColor: submitFocused ? theme.surface : undefined,
          }}
        >
          <text
            style={{
              fg: submitFocused ? theme.primary : theme.foreground,
              attributes: submitFocused ? TextAttributes.BOLD : undefined,
            }}
          >
            Submit ↵
          </text>
        </Button>
      </box>
    </box>
  )
}
