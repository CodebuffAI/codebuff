/**
 * Accordion-style question component that can expand/collapse
 */

import React, { useCallback } from 'react'

import { CustomAnswerInput } from './custom-answer-input'
import { OptionsList } from './options-list'
import { QuestionHeader } from './question-header'
import { getOptionLabel } from '../constants'

import type { AskUserQuestion } from '../../../types/store'

/** Answer state for a single question */
export interface AccordionAnswer {
  selectedIndex?: number
  selectedIndices?: Set<number>
  isCustom?: boolean
  customText?: string
}

export interface AccordionQuestionProps {
  question: AskUserQuestion
  questionIndex: number
  totalQuestions: number
  answer: AccordionAnswer | undefined
  isExpanded: boolean
  isTypingCustom: boolean
  onToggleExpand: () => void
  onSelectOption: (optionIndex: number) => void
  onToggleOption: (optionIndex: number) => void
  onSetCustomText: (text: string, cursorPosition: number) => void
  onCustomSubmit: () => void
  customCursorPosition: number
  focusedOptionIndex: number | null
  onFocusOption: (index: number | null) => void
}

export const AccordionQuestion: React.FC<AccordionQuestionProps> = ({
  question,
  questionIndex,
  totalQuestions,
  answer,
  isExpanded,
  isTypingCustom,
  onToggleExpand,
  onSelectOption,
  onToggleOption,
  onSetCustomText,
  onCustomSubmit,
  customCursorPosition,
  focusedOptionIndex,
  onFocusOption,
}) => {
  const isMultiSelect = question.multiSelect
  const showQuestionNumber = totalQuestions > 1
  const questionNumber = questionIndex + 1
  const questionPrefix = showQuestionNumber ? `${questionNumber}. ` : ''
  const optionIndent = 2 + questionPrefix.length

  // Check if question has a valid answer
  const isAnswered =
    !!answer &&
    ((answer.isCustom && !!answer.customText?.trim()) ||
      (isMultiSelect && (answer.selectedIndices?.size ?? 0) > 0) ||
      answer.selectedIndex !== undefined)

  const getAnswerDisplay = (): string => {
    if (!answer) return '(click to answer)'

    if (answer.isCustom && answer.customText) {
      const hadNewlines = /\r?\n/.test(answer.customText)
      const flattenedText = answer.customText
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return `Custom: ${flattenedText}${hadNewlines ? '…' : ''}`
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

  const isCustomSelected = answer?.isCustom ?? false

  const handlePaste = useCallback(
    (text: string) => {
      const currentText = answer?.customText || ''
      const newText =
        currentText.slice(0, customCursorPosition) +
        text +
        currentText.slice(customCursorPosition)
      onSetCustomText(newText, customCursorPosition + text.length)
    },
    [answer?.customText, customCursorPosition, onSetCustomText],
  )

  return (
    <box style={{ flexDirection: 'column', marginBottom: 1, width: '100%' }}>
      {/* Question header - always visible */}
      <QuestionHeader
        questionText={question.question}
        questionPrefix={questionPrefix}
        isExpanded={isExpanded}
        isAnswered={isAnswered}
        answerDisplay={getAnswerDisplay()}
        onToggleExpand={onToggleExpand}
      />

      {/* Expanded content - options */}
      {isExpanded && (
        <box style={{ flexDirection: 'column', width: '100%' }}>
          <OptionsList
            question={question}
            answer={answer}
            optionIndent={optionIndent}
            focusedOptionIndex={focusedOptionIndex}
            isTypingCustom={isTypingCustom}
            onSelectOption={onSelectOption}
            onToggleOption={onToggleOption}
            onFocusOption={onFocusOption}
          />

          {/* Text input area when Custom is selected */}
          {isCustomSelected && (
            <CustomAnswerInput
              value={answer?.customText || ''}
              cursorPosition={customCursorPosition}
              focused={isTypingCustom}
              optionIndent={optionIndent}
              onChange={onSetCustomText}
              onSubmit={onCustomSubmit}
              onPaste={handlePaste}
            />
          )}
        </box>
      )}
    </box>
  )
}
