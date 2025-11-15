import React, { useCallback, useRef, useState } from 'react'
import { useRenderer, useKeyboard } from '@opentui/react'
import { TextAttributes } from '@opentui/core'

import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import type { ChatMessage } from '../types/chat'

interface FeedbackModalProps {
  open: boolean
  message: ChatMessage | null
  onClose: () => void
  onSubmit: (data: { text: string; category: string | null }) => void
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose, onSubmit }) => {
  const theme = useTheme()
  const renderer = useRenderer()
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackCursor, setFeedbackCursor] = useState(0)
  const [category, setCategory] = useState<string>('other')
  const inputRef = useRef<MultilineInputHandle | null>(null)

  const terminalWidth = renderer?.width || 80
  const terminalHeight = renderer?.height || 24

  const modalWidth = Math.max(60, Math.min(terminalWidth - 4, 100))
  const modalHeight = Math.max(12, Math.min(terminalHeight - 4, 24))
  const modalLeft = Math.floor((terminalWidth - modalWidth) / 2)
  const modalTop = Math.floor((terminalHeight - modalHeight) / 2)

  const handleSubmit = useCallback(() => {
    const text = feedbackText.trim()
    if (text.length === 0) return
    onSubmit({ text, category })
    setFeedbackText('')
    setCategory('other')
  }, [onSubmit, feedbackText, category])

  // Handle Ctrl+C: clear input first, then close if already empty
  // Handle Escape: close modal directly
  useKeyboard(
    useCallback(
      (key) => {
        if (!open) return

        const isCtrlC = key.ctrl && key.name === 'c'
        const isEscape = key.name === 'escape'

        if (!isCtrlC && !isEscape) return

        if ('preventDefault' in key && typeof key.preventDefault === 'function') {
          key.preventDefault()
        }

        if (isEscape) {
          // Escape always closes the modal
          onClose()
        } else if (isCtrlC) {
          if (feedbackText.length === 0) {
            // Input is already empty, close the modal
            onClose()
          } else {
            // Clear the input
            setFeedbackText('')
            setFeedbackCursor(0)
          }
        }
      },
      [open, feedbackText, onClose]
    )
  )

  if (!open) return null

  const categoryOptions = [
    { id: 'good_code', label: 'Good result', highlight: theme.success },
    { id: 'bad_code', label: 'Bad result', highlight: theme.error },
    { id: 'bug', label: 'Bug', highlight: theme.warning },
    { id: 'other', label: 'Other', highlight: theme.info },
  ] as const

  const canSubmit = feedbackText.trim().length > 0

  return (
    <box
      position="absolute"
      left={modalLeft}
      top={modalTop}
      border
      borderStyle="double"
      borderColor={theme.primary}
      style={{
        width: modalWidth,
        height: modalHeight,
        backgroundColor: theme.surface,
        padding: 1,
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.primary}>Share Feedback</span>
        </text>
        <Button
          onClick={onClose}
          style={{
            paddingLeft: 1,
            paddingRight: 1,
            borderStyle: 'single',
            borderColor: theme.border,
            customBorderChars: BORDER_CHARS,
          }}
        >
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.muted}>X</span>
          </text>
        </Button>
      </box>

      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.secondary}>Thanks for helping us improve! What happened?</span>
      </text>

      <box style={{ flexDirection: 'column', gap: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>Category:</span>
        </text>
        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
          {categoryOptions.map((option) => {
            const isSelected = category === option.id
            return (
              <Button
                key={option.id}
                onClick={() => setCategory(option.id)}
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
                  customBorderChars: BORDER_CHARS,
                  backgroundColor: 'transparent',
                }}
              >
                <text style={{ wrapMode: 'none' }}>
                  <span fg={isSelected ? option.highlight : theme.muted}>{isSelected ? '◉' : '◯'}</span>
                  <span fg={isSelected ? theme.foreground : theme.secondary}> {option.label}</span>
                </text>
              </Button>
            )
          })}
        </box>
      </box>

      <box
        border
        borderStyle="single"
        borderColor={theme.border}
        customBorderChars={BORDER_CHARS}
        style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 0, paddingBottom: 0 }}
      >
        <MultilineInput
          value={feedbackText}
          onChange={(next: { text: string; cursorPosition: number; lastEditDueToNav: boolean } | ((prev: { text: string; cursorPosition: number; lastEditDueToNav: boolean }) => { text: string; cursorPosition: number; lastEditDueToNav: boolean })) => {
            const v = typeof next === 'function' ? next({ text: feedbackText, cursorPosition: feedbackCursor, lastEditDueToNav: false }) : next
            setFeedbackText(v.text)
            setFeedbackCursor(v.cursorPosition)
          }}
          onSubmit={handleSubmit}
          placeholder={'Tell us more...'}
          focused={true}
          maxHeight={6}
          width={modalWidth - 6}
          textAttributes={undefined}
          ref={inputRef}
          cursorPosition={feedbackCursor}
        />
      </box>

      <box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>Auto-attached: message • trace • session</span>
        </text>
        <Button
          onClick={() => {
            if (canSubmit) handleSubmit()
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
            borderStyle: 'single',
            borderColor: canSubmit ? theme.foreground : theme.border,
            customBorderChars: BORDER_CHARS,
            backgroundColor: 'transparent',
          }}
        >
          <text style={{ wrapMode: 'none' }} attributes={canSubmit ? undefined : TextAttributes.DIM | TextAttributes.ITALIC}>
            <span fg={canSubmit ? theme.foreground : theme.muted}>{'SUBMIT'}</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
