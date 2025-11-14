import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useRenderer } from '@opentui/react'

import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import type { ChatMessage } from '../types/chat'

interface FeedbackModalProps {
  open: boolean
  message: ChatMessage | null
  onClose: () => void
  onSubmit: (text: string) => void
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, message, onClose, onSubmit }) => {
  const theme = useTheme()
  const renderer = useRenderer()
  const [value, setValue] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const inputRef = useRef<MultilineInputHandle | null>(null)

  const terminalWidth = renderer?.width || 80
  const terminalHeight = renderer?.height || 24

  const modalWidth = Math.max(60, Math.min(terminalWidth - 4, 100))
  const modalHeight = Math.max(12, Math.min(terminalHeight - 4, 24))
  const modalLeft = Math.floor((terminalWidth - modalWidth) / 2)
  const modalTop = Math.floor((terminalHeight - modalHeight) / 2)

  const contextPreview = useMemo(() => {
    if (!message) return 'No message context'
    const runState = message.metadata?.runState
    const safe = {
      id: message.id,
      variant: message.variant,
      timestamp: message.timestamp,
      completionTime: message.completionTime,
      credits: message.credits,
      runStatePreview: runState ? JSON.stringify(runState).slice(0, 1000) + (JSON.stringify(runState).length > 1000 ? ' …' : '') : 'n/a',
    }
    return JSON.stringify(safe, null, 2)
  }, [message])

  const handleSubmit = useCallback(() => {
    const text = value.trim()
    if (text.length === 0) return
    onSubmit(text)
    setValue('')
  }, [onSubmit, value])

  if (!open) return null

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
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.primary}>Share Feedback</span>
      </text>

      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.secondary}>Thanks for helping us improve! What happened?</span>
      </text>

      <box style={{ flexDirection: 'column' }}>
        <MultilineInput
          value={value}
          onChange={(next: { text: string; cursorPosition: number; lastEditDueToNav: boolean } | ((prev: { text: string; cursorPosition: number; lastEditDueToNav: boolean }) => { text: string; cursorPosition: number; lastEditDueToNav: boolean })) => {
            const v = typeof next === 'function' ? next({ text: value, cursorPosition, lastEditDueToNav: false }) : next
            setValue(v.text)
            setCursorPosition(v.cursorPosition)
          }}
          onSubmit={handleSubmit}
          placeholder={'Tell us more...'}
          focused={true}
          maxHeight={6}
          width={modalWidth - 4}
          textAttributes={undefined}
          ref={inputRef}
          cursorPosition={cursorPosition}
        />
      </box>

      <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>Auto-attached: Message content • Trace data • Session info</span>
        </text>
        <Button onClick={() => setShowDetails((s) => !s)}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.info}>{showDetails ? '[Hide details]' : '[View details]'}</span>
          </text>
        </Button>
      </box>

      {showDetails && (
        <box style={{ flexDirection: 'column', maxHeight: 6 }}>
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.muted}>{contextPreview}</span>
          </text>
        </box>
      )}

      <box style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 2 }}>
        <Button onClick={onClose}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.error}>Cancel</span>
          </text>
        </Button>
        <Button onClick={handleSubmit}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.success}>Submit</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
