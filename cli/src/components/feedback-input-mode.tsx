import React, { useCallback, useRef, useState } from 'react'
import { useKeyboard } from '@opentui/react'
import { TextAttributes } from '@opentui/core'

import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

interface FeedbackInputModeProps {
  feedbackText: string
  feedbackCursor: number
  category: string
  onFeedbackTextChange: (text: string, cursor: number) => void
  onCategoryChange: (category: string) => void
  onSubmit: () => void
  onCancel: () => void
  width: number
}

export const FeedbackInputMode: React.FC<FeedbackInputModeProps> = ({
  feedbackText,
  feedbackCursor,
  category,
  onFeedbackTextChange,
  onCategoryChange,
  onSubmit,
  onCancel,
  width,
}) => {
  const theme = useTheme()
  const inputRef = useRef<MultilineInputHandle | null>(null)
  const canSubmit = feedbackText.trim().length > 0
  const [closeButtonHovered, setCloseButtonHovered] = useState(false)

  // Handle keyboard shortcuts
  useKeyboard(
    useCallback(
      (key) => {
        const isCtrlC = key.ctrl && key.name === 'c'
        const isEscape = key.name === 'escape'
        const isCtrlEnter = false // handled via onKeyIntercept

        if (!isCtrlC && !isEscape) return

        if ('preventDefault' in key && typeof key.preventDefault === 'function') {
          key.preventDefault()
        }

        if (isEscape) {
          onCancel()
        } else if (isCtrlC) {
          if (feedbackText.length === 0) {
            onCancel()
          } else {
            onFeedbackTextChange('', 0)
          }
        }
        // Ctrl+Enter handled via onKeyIntercept
      },
      [feedbackText, onCancel, onFeedbackTextChange, onSubmit, canSubmit]
    )
  )

  const categoryOptions = [
    { id: 'good_result', label: 'Good result', highlight: theme.success, placeholder: 'What did you like? (e.g., "Fast and accurate", "Great explanation")' },
    { id: 'bad_result', label: 'Bad result', highlight: theme.error, placeholder: 'What went wrong? (e.g., "Incorrect changes", "Missed the requirement")' },
    { id: 'app_bug', label: 'App bug', highlight: theme.warning, placeholder: 'Report a problem with Codebuff (crashes, errors, UI issues, etc.)' },
    { id: 'other', label: 'Other', highlight: theme.info, placeholder: 'Tell us more (what happened, what you expected)...' },
  ] as const

  return (
    <box
      border
      borderStyle="single"
      borderColor={theme.primary}
      customBorderChars={BORDER_CHARS}
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
      }}
    >

      {/* Header: helper text + close X */}
      <box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.secondary}>Share feedback — thanks for helping us improve!</span>
        </text>
        <box onMouseDown={onCancel} onMouseOver={() => setCloseButtonHovered(true)} onMouseOut={() => setCloseButtonHovered(false)}>
          <text style={{ wrapMode: 'none' }} selectable={false}>
            <span fg={closeButtonHovered ? theme.foreground : theme.muted}>X</span>
          </text>
        </box>
      </box>

      {/* Category buttons */}
      <box style={{ flexDirection: 'row', gap: 1, paddingTop: 0, paddingBottom: 0 }}>
        {categoryOptions.map((option) => {
          const isSelected = category === option.id
          return (
            <Button
              key={option.id}
              onClick={() => onCategoryChange(option.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 1,
                paddingLeft: 1,
                paddingRight: 1,
                paddingTop: 0,
                paddingBottom: 0,
                borderStyle: 'single',
                borderColor: isSelected ? option.highlight : theme.border,
                customBorderChars: BORDER_CHARS,                  backgroundColor: 'transparent',
              }}
            >
              <text style={{ wrapMode: 'none' }}>
                <span fg={isSelected ? option.highlight : theme.muted}>
                  {isSelected ? '◉' : '◯'}
                </span>
                <span fg={isSelected ? theme.foreground : theme.secondary}>
                  {' '}{option.label}
                </span>
              </text>
            </Button>
          )
        })}
      </box>

      {/* Separator */}
      <box style={{ height: 1, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.border}>{'─'.repeat(width - 4)}</span>
        </text>
      </box>

      {/* Feedback input */}
      <box style={{ paddingTop: 0, paddingBottom: 0 }}>
        <MultilineInput
          value={feedbackText}
          onChange={(next: { text: string; cursorPosition: number; lastEditDueToNav: boolean } | ((prev: { text: string; cursorPosition: number; lastEditDueToNav: boolean }) => { text: string; cursorPosition: number; lastEditDueToNav: boolean })) => {
            const v = typeof next === 'function'
              ? next({ text: feedbackText, cursorPosition: feedbackCursor, lastEditDueToNav: false })
              : next
            onFeedbackTextChange(v.text, v.cursorPosition)
          }}
          onSubmit={onSubmit}
          onKeyIntercept={(key) => {
            const isEnter = key.name === 'return' || key.name === 'enter'
            if (!isEnter) return false
            // Just add newline on Enter
            const newText = feedbackText.slice(0, feedbackCursor) + '\n' + feedbackText.slice(feedbackCursor)
            onFeedbackTextChange(newText, feedbackCursor + 1)
            return true
          }}
          placeholder={categoryOptions.find(opt => opt.id === category)?.placeholder || 'Tell us more (what happened, what you expected)...'}
          focused={true}
          maxHeight={5}
          minHeight={3}
          width={width - 4}
          textAttributes={undefined}
          ref={inputRef}
          cursorPosition={feedbackCursor}
        />
      </box>

      {/* Separator */}
      <box style={{ height: 1, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.border}>{'─'.repeat(width - 4)}</span>
        </text>
      </box>

      {/* Footer with auto-attached info and submit button */}
      <box style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 0,
        paddingBottom: 0,
        gap: 2
      }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>Auto-attached: message • trace • session</span>
        </text>
        <Button
          onClick={() => {
            if (canSubmit) onSubmit()
          }}
          style={{
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            borderStyle: 'single',
            borderColor: canSubmit ? theme.foreground : theme.border,
            customBorderChars: BORDER_CHARS,
            backgroundColor: 'transparent',
          }}
        >
          <text style={{ wrapMode: 'none' }} attributes={canSubmit ? undefined : TextAttributes.DIM | TextAttributes.ITALIC}>
            <span fg={canSubmit ? theme.foreground : theme.muted}>SUBMIT</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
