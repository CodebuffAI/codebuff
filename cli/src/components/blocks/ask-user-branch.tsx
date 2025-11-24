import React from 'react'
import { TextAttributes } from '@opentui/core'
import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'
import type { AskUserContentBlock } from '../../types/chat'

interface AskUserBranchProps {
  block: AskUserContentBlock
  availableWidth: number
}

export const AskUserBranch = ({ block, availableWidth }: AskUserBranchProps) => {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        width: availableWidth,
        borderStyle: 'single',
        borderColor: theme.secondary,
        customBorderChars: BORDER_CHARS,
        padding: 1,
        marginTop: 1,
        marginBottom: 1,
      }}
    >
      {block.skipped ? (
        <text style={{ fg: theme.muted, attributes: TextAttributes.ITALIC }}>
          User skipped the questions.
        </text>
      ) : (
        <box style={{ flexDirection: 'column', gap: 1 }}>
          <text style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}>
            User Answers:
          </text>
          {block.questions.map((q, idx) => {
            const answer = block.answers?.find((a) => a.questionIndex === idx)
            const displayAnswer = answer?.otherText
              ? `"${answer.otherText}"`
              : answer?.selectedOption || 'No answer'
            const isCustomAnswer = !!answer?.otherText
            return (
              <box key={idx} style={{ flexDirection: 'column', gap: 0 }}>
                <text style={{ fg: theme.foreground }}>
                  {idx + 1}. {q.question}
                </text>
                <text style={{
                  fg: theme.primary,
                  marginLeft: 2,
                  attributes: isCustomAnswer ? TextAttributes.ITALIC : undefined,
                }}>
                  ↳ {displayAnswer}
                </text>
              </box>
            )
          })}
        </box>
      )}
    </box>
  )
}
