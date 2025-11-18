import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useRef, useState } from 'react'

import { Button } from './button'
import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { Separator } from './separator'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

type CategoryHighlightKey = 'success' | 'error' | 'warning' | 'info'

type CategoryOption = {
  id: 'good_result' | 'bad_result' | 'app_bug' | 'other'
  label: string
  shortLabel: string
  highlightKey: CategoryHighlightKey
  placeholder: string
}

const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  {
    id: 'good_result',
    label: 'Good result',
    shortLabel: 'Good',
    highlightKey: 'success',
    placeholder:
      'What did you like? (e.g., "Fast and accurate", "Great explanation")',
  },
  {
    id: 'bad_result',
    label: 'Bad result',
    shortLabel: 'Bad',
    highlightKey: 'error',
    placeholder:
      'What went wrong? (e.g., "Incorrect changes", "Missed the requirement")',
  },
  {
    id: 'app_bug',
    label: 'App bug',
    shortLabel: 'Bug',
    highlightKey: 'warning',
    placeholder:
      'Report a problem with Codebuff (crashes, errors, UI issues, etc.)',
  },
  {
    id: 'other',
    label: 'Other',
    shortLabel: 'Other',
    highlightKey: 'info',
    placeholder: 'Tell us more (what happened, what you expected)...',
  },
] as const

const FEEDBACK_CONTAINER_HORIZONTAL_INSET = 4 // border + padding on each side
const CATEGORY_BUTTON_EXTRA_WIDTH = 6 // indicator + padding + border
const CATEGORY_BUTTON_GAP_WIDTH = 1

const calculateCategoryRowWidth = (labels: readonly string[]): number =>
  labels.reduce((total, label, idx) => {
    const buttonWidth = label.length + CATEGORY_BUTTON_EXTRA_WIDTH
    const gapWidth = idx === 0 ? 0 : CATEGORY_BUTTON_GAP_WIDTH
    return total + buttonWidth + gapWidth
  }, 0)

const FULL_CATEGORY_ROW_WIDTH = calculateCategoryRowWidth(
  CATEGORY_OPTIONS.map((opt) => opt.label),
)

interface FeedbackTextSectionProps {
  value: string
  cursor: number
  onChange: (text: string) => void
  onCursorChange: (cursor: number) => void
  onSubmit: () => void
  placeholder: string
  inputRef?: React.MutableRefObject<MultilineInputHandle | null>
  width: number
}

const FeedbackTextSection: React.FC<FeedbackTextSectionProps> = ({
  value,
  cursor,
  onChange,
  onCursorChange,
  onSubmit,
  placeholder,
  inputRef,
  width,
}) => {
  const inputWidth = Math.max(1, width - FEEDBACK_CONTAINER_HORIZONTAL_INSET)

  return (
    <>
      {/* Top separator */}
      <Separator width={width} widthOffset={4} />

      {/* Feedback input */}
      <box style={{ paddingTop: 0, paddingBottom: 0 }}>
        <MultilineInput
          value={value}
          onChange={({ text, cursorPosition }) => {
            onChange(text)
            onCursorChange(cursorPosition)
          }}
          onSubmit={onSubmit}
          onKeyIntercept={(key) => {
            const isEnter = key.name === 'return' || key.name === 'enter'
            if (!isEnter) return false
            // Just add newline on Enter
            const newText = value.slice(0, cursor) + '\n' + value.slice(cursor)
            onChange(newText)
            onCursorChange(cursor + 1)
            return true
          }}
          placeholder={placeholder}
          focused={true}
          maxHeight={5}
          minHeight={3}
          width={inputWidth}
          textAttributes={undefined}
          ref={inputRef}
          cursorPosition={cursor}
        />
      </box>

      {/* Bottom separator */}
      <Separator width={width} widthOffset={4} />
    </>
  )
}

interface FeedbackInputModeProps {
  value: string
  cursor: number
  feedbackCategory: string
  onChange: (text: string) => void
  onCursorChange: (cursor: number) => void
  onCategoryChange: (category: string) => void
  onSubmit: () => void
  onCancel: () => void
  onClear: () => void
  inputRef?: React.MutableRefObject<any>
  width: number
}

export const FeedbackInputMode: React.FC<FeedbackInputModeProps> = ({
  value,
  cursor,
  feedbackCategory,
  onChange,
  onCursorChange,
  onCategoryChange,
  onSubmit,
  onCancel,
  onClear,
  inputRef: externalInputRef,
  width,
}) => {
  const theme = useTheme()
  const internalInputRef = useRef<MultilineInputHandle | null>(null)
  const inputRef = externalInputRef || internalInputRef
  const canSubmit = value.trim().length > 0
  const [closeButtonHovered, setCloseButtonHovered] = useState(false)
  const availableWidth = Math.max(
    0,
    width - FEEDBACK_CONTAINER_HORIZONTAL_INSET,
  )
  const shouldUseShortLabels = FULL_CATEGORY_ROW_WIDTH > availableWidth

  // Handle keyboard shortcuts
  useKeyboard(
    useCallback(
      (key) => {
        const isCtrlC = key.ctrl && key.name === 'c'
        const isEscape = key.name === 'escape'

        if (!isCtrlC && !isEscape) return

        if (
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }

        if (isEscape) {
          onCancel()
        } else if (isCtrlC) {
          value.length === 0 ? onCancel() : onClear()
        }
      },
      [value, onCancel, onClear, onSubmit, canSubmit],
    ),
  )

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
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.secondary}>
            Share feedback — thanks for helping us improve!
          </span>
        </text>
        <box
          onMouseDown={onCancel}
          onMouseOver={() => setCloseButtonHovered(true)}
          onMouseOut={() => setCloseButtonHovered(false)}
        >
          <text style={{ wrapMode: 'none' }} selectable={false}>
            <span fg={closeButtonHovered ? theme.foreground : theme.muted}>
              X
            </span>
          </text>
        </box>
      </box>

      {/* Category buttons */}
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        {CATEGORY_OPTIONS.map((option) => {
          const optionHighlight = theme[option.highlightKey]
          const isSelected = feedbackCategory === option.id
          const label = shouldUseShortLabels ? option.shortLabel : option.label
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
                borderColor: isSelected ? optionHighlight : theme.border,
                customBorderChars: BORDER_CHARS,
                backgroundColor: 'transparent',
              }}
            >
              <text style={{ wrapMode: 'none' }}>
                <span fg={isSelected ? optionHighlight : theme.muted}>
                  {isSelected ? '◉' : '◯'}
                </span>
                <span fg={isSelected ? theme.foreground : theme.secondary}>
                  {' '}
                  {label}
                </span>
              </text>
            </Button>
          )
        })}
      </box>

      {/* Feedback text section with separators */}
      <FeedbackTextSection
        value={value}
        cursor={cursor}
        onChange={onChange}
        onCursorChange={onCursorChange}
        onSubmit={onSubmit}
        placeholder={
          CATEGORY_OPTIONS.find((opt) => opt.id === feedbackCategory)
            ?.placeholder ||
          'Tell us more (what happened, what you expected)...'
        }
        inputRef={inputRef}
        width={width}
      />

      {/* Footer with auto-attached info and submit button */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 0,
          paddingBottom: 0,
          gap: 2,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>Session details are auto-attached</span>
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
          <text
            style={{ wrapMode: 'none' }}
            attributes={
              canSubmit ? undefined : TextAttributes.DIM | TextAttributes.ITALIC
            }
          >
            <span fg={canSubmit ? theme.foreground : theme.muted}>SUBMIT</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
