/**
 * Accordion-style question component that can expand/collapse
 */

import { TextAttributes } from '@opentui/core'
import React from 'react'

import { QuestionOption } from './question-option'
import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { MultilineInput } from '../../multiline-input'
import { SYMBOLS } from '../constants'

import type { KeyEvent } from '@opentui/core'

import type { AskUserQuestion } from '../../../state/chat-store'

/** Option type - can be string or object with label/description */
type AskUserOption = string | { label: string; description?: string }

/** Helper to extract label from an option (handles both string and object formats) */
const getOptionLabel = (option: AskUserOption): string => {
  return typeof option === 'string' ? option : option?.label ?? ''
}

/** Answer state for a single question */
export interface AccordionAnswer {
  selectedIndex?: number
  selectedIndices?: Set<number>
  isOther?: boolean
  otherText?: string
}

export interface AccordionQuestionProps {
  question: AskUserQuestion
  questionIndex: number
  totalQuestions: number
  answer: AccordionAnswer | undefined
  isExpanded: boolean
  isQuestionFocused: boolean
  isTypingOther: boolean
  onToggleExpand: () => void
  onSelectOption: (optionIndex: number) => void
  onToggleOption: (optionIndex: number) => void
  onSetOtherText: (text: string, cursorPosition: number) => void
  onOtherSubmit: () => void
  onOtherCancel: () => void
  otherCursorPosition: number
  focusedOptionIndex: number | null
  onFocusOption: (index: number | null) => void
}

export const AccordionQuestion: React.FC<AccordionQuestionProps> = ({
  question,
  questionIndex,
  totalQuestions,
  answer,
  isExpanded,
  isQuestionFocused,
  isTypingOther,
  onToggleExpand,
  onSelectOption,
  onToggleOption,
  onSetOtherText,
  onOtherSubmit,
  onOtherCancel,
  otherCursorPosition,
  focusedOptionIndex,
  onFocusOption,
}) => {
  const theme = useTheme()
  const isMultiSelect = question.multiSelect
  const showQuestionNumber = totalQuestions > 1

  // Check if question has a valid answer
  const isAnswered = (() => {
    if (!answer) return false
    if (answer.isOther && answer.otherText?.trim()) return true
    if (
      isMultiSelect &&
      answer.selectedIndices &&
      answer.selectedIndices.size > 0
    )
      return true
    if (answer.selectedIndex !== undefined) return true
    return false
  })()

  // Get display text for the current answer
  const getAnswerDisplay = (): string => {
    if (!answer) return '(click to answer)'

    if (answer.isOther && answer.otherText) {
      return `Custom: ${answer.otherText}`
    }

    if (isMultiSelect && answer.selectedIndices) {
      const selectedLabels = Array.from(answer.selectedIndices)
        .map((idx) => getOptionLabel(question.options[idx]))
        .filter(Boolean)
      return selectedLabels.length > 0
        ? selectedLabels.join(', ')
        : '(click to answer)'
    }

    if (answer.selectedIndex !== undefined) {
      const label = getOptionLabel(question.options[answer.selectedIndex])
      return label || '(click to answer)'
    }

    return '(click to answer)'
  }

  const handleOptionSelect = (optionIndex: number) => {
    if (isMultiSelect) {
      onToggleOption(optionIndex)
    } else {
      onSelectOption(optionIndex)
    }
  }

  // Question number (1-indexed) - only shown when multiple questions
  const questionNumber = questionIndex + 1

  return (
    <box style={{ flexDirection: 'column', marginBottom: 1 }}>
      {/* Question header - always visible */}
      <Button
        onClick={onToggleExpand}
        style={{
          flexDirection: 'column',
          backgroundColor:
            isExpanded || isQuestionFocused ? theme.surface : undefined,
        }}
      >
        <text>
          <span fg={theme.muted}>{isExpanded ? '▼' : '▶'}</span>
          <span
            fg={theme.foreground}
            attributes={isExpanded ? TextAttributes.BOLD : undefined}
          >
            {' '}
            {showQuestionNumber ? `${questionNumber}. ` : ''}{question.question}
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
              {isAnswered ? `"${getAnswerDisplay()}"` : '(click to answer)'}
            </span>
          </text>
        )}
      </Button>

      {/* Expanded content - options */}
      {isExpanded && (
        <box style={{ flexDirection: 'column', marginLeft: 2, marginTop: 1 }}>
          {/* Multi-select hint */}
          {isMultiSelect && (
            <text style={{ fg: theme.muted, marginBottom: 1 }}>
              (Select multiple options)
            </text>
          )}

          {/* Options */}
          {question.options.map((option, optionIndex: number) => {
            const isSelected = isMultiSelect
              ? answer?.selectedIndices?.has(optionIndex) ?? false
              : answer?.selectedIndex === optionIndex

            return (
              <QuestionOption
                key={optionIndex}
                option={option}
                optionIndex={optionIndex}
                isSelected={isSelected}
                isFocused={focusedOptionIndex === optionIndex}
                isMultiSelect={isMultiSelect}
                onSelect={() => handleOptionSelect(optionIndex)}
                onMouseOver={() => onFocusOption(optionIndex)}
              />
            )
          })}

          {/* Custom option - text input (always uses radio button style) */}
          <Button
            onClick={() => {
              if (isMultiSelect) {
                onToggleOption(-1)
              } else {
                onSelectOption(-1)
              }
            }}
            onMouseOver={() => onFocusOption(question.options.length)}
            style={{
              backgroundColor:
                focusedOptionIndex === question.options.length || isTypingOther
                  ? theme.surface
                  : undefined,
            }}
          >
            <box style={{ flexDirection: 'row', gap: 1 }}>
              <text
                style={{
                  fg: answer?.isOther
                    ? theme.primary
                    : focusedOptionIndex === question.options.length
                      ? theme.foreground
                      : theme.muted,
                  attributes:
                    focusedOptionIndex === question.options.length
                      ? TextAttributes.BOLD
                      : undefined,
                }}
              >
                {answer?.isOther ? SYMBOLS.SELECTED : SYMBOLS.UNSELECTED}
              </text>
              <text
                style={{
                  fg: answer?.isOther
                    ? theme.primary
                    : focusedOptionIndex === question.options.length
                      ? theme.foreground
                      : theme.muted,
                  attributes:
                    focusedOptionIndex === question.options.length
                      ? TextAttributes.BOLD
                      : undefined,
                }}
              >
                Custom
                {answer?.isOther && !isTypingOther && answer?.otherText && (
                  <span fg={theme.muted} attributes={TextAttributes.ITALIC}>
                    : {answer.otherText}
                  </span>
                )}
              </text>
            </box>
          </Button>

          {/* Text input area when typing Custom */}
          {isTypingOther && (
            <box style={{ flexDirection: 'column', marginLeft: 4, marginTop: 1 }}>
              <MultilineInput
                value={answer?.otherText || ''}
                cursorPosition={otherCursorPosition}
                onChange={(inputValue) => {
                  onSetOtherText(inputValue.text, inputValue.cursorPosition)
                }}
                onSubmit={onOtherSubmit}
                onPaste={(text) => {
                  if (text) {
                    const currentText = answer?.otherText || ''
                    const newText =
                      currentText.slice(0, otherCursorPosition) +
                      text +
                      currentText.slice(otherCursorPosition)
                    onSetOtherText(newText, otherCursorPosition + text.length)
                  }
                }}
                onKeyIntercept={(key: KeyEvent) => {
                  // Handle Escape/Ctrl+C: first clears text, second deselects option
                  if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
                    if ('preventDefault' in key && typeof key.preventDefault === 'function') {
                      key.preventDefault()
                    }
                    const currentText = answer?.otherText || ''
                    if (currentText.length > 0) {
                      // First escape: just clear the text
                      onSetOtherText('', 0)
                    } else {
                      // Second escape (text already empty): deselect the option
                      onOtherCancel()
                    }
                    return true
                  }
                  return false
                }}
                focused={true}
                maxHeight={3}
                minHeight={1}
                placeholder="Type your answer..."
              />
            </box>
          )}
        </box>
      )}
    </box>
  )
}
