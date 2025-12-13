/**
 * Accordion-style question component that can expand/collapse
 */

import { TextAttributes } from '@opentui/core'
import React from 'react'

import { QuestionOption } from './question-option'
import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { MultilineInput } from '../../multiline-input'
import { getOptionLabel, OTHER_OPTION_INDEX, SYMBOLS } from '../constants'

import type { AskUserQuestion } from '../../../state/chat-store'

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
  isTypingOther: boolean
  onToggleExpand: () => void
  onSelectOption: (optionIndex: number) => void
  onToggleOption: (optionIndex: number) => void
  onSetOtherText: (text: string, cursorPosition: number) => void
  onOtherSubmit: () => void
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
  isTypingOther,
  onToggleExpand,
  onSelectOption,
  onToggleOption,
  onSetOtherText,
  onOtherSubmit,
  otherCursorPosition,
  focusedOptionIndex,
  onFocusOption,
}) => {
  const theme = useTheme()
  const isMultiSelect = question.multiSelect
  const showQuestionNumber = totalQuestions > 1
  const questionNumber = questionIndex + 1
  const questionPrefix = showQuestionNumber ? `${questionNumber}. ` : ''
  const optionIndent = 2 + questionPrefix.length

  // Check if question has a valid answer
  const isAnswered =
    !!answer &&
    ((answer.isOther && !!answer.otherText?.trim()) ||
      (isMultiSelect && (answer.selectedIndices?.size ?? 0) > 0) ||
      answer.selectedIndex !== undefined)

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

  const isCustomSelected = answer?.isOther ?? false
  const isCustomFocused = focusedOptionIndex === question.options.length || isTypingOther
  const selectedFg = theme.name === 'dark' ? '#ffffff' : '#000000'
  const customSymbol = isMultiSelect
    ? isCustomSelected ? SYMBOLS.CHECKBOX_CHECKED : SYMBOLS.CHECKBOX_UNCHECKED
    : isCustomSelected ? SYMBOLS.SELECTED : SYMBOLS.UNSELECTED
  const customFg = isCustomFocused ? '#000000' : isCustomSelected ? selectedFg : theme.muted
  const customAttributes = isCustomFocused || isCustomSelected ? TextAttributes.BOLD : undefined

  return (
    <box style={{ flexDirection: 'column', marginBottom: 1, width: '100%' }}>
      {/* Question header - always visible */}
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
            {question.question}
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
        <box style={{ flexDirection: 'column', width: '100%' }}>
          {/* Multi-select hint */}
          {isMultiSelect && (
            <text style={{ fg: theme.muted, paddingLeft: optionIndent }}>
              (Select multiple options)
            </text>
          )}

          {/* Options */}
          {question.options.map((option, optionIndex) => {
            const isSelected = isMultiSelect
              ? answer?.selectedIndices?.has(optionIndex) ?? false
              : answer?.selectedIndex === optionIndex

            return (
              <QuestionOption
                key={optionIndex}
                option={option}
                indent={optionIndent}
                isSelected={isSelected}
                isFocused={focusedOptionIndex === optionIndex}
                isMultiSelect={isMultiSelect}
                onSelect={() => handleOptionSelect(optionIndex)}
                onMouseOver={() => onFocusOption(optionIndex)}
              />
            )
          })}

          {/* Custom option - uses checkbox style for multi-select questions */}
          <Button
            onClick={() => {
              if (isMultiSelect) {
                onToggleOption(OTHER_OPTION_INDEX)
              } else {
                onSelectOption(OTHER_OPTION_INDEX)
              }
            }}
            onMouseOver={() => onFocusOption(question.options.length)}
            style={{
              width: '100%',
              flexDirection: 'column',
              gap: 0,
              backgroundColor: isCustomFocused ? theme.primary : undefined,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: optionIndent,
            }}
          >
            <text style={{ fg: customFg, attributes: customAttributes }}>
              {`${customSymbol} Custom`}
            </text>
            {isCustomFocused && (
              <text
                style={{
                  fg: '#000000',
                  marginLeft: 2,
                }}
              >
                Type your own answer
              </text>
            )}
          </Button>

          {/* Text input area when typing Custom */}
          {isTypingOther && (
            <box style={{ flexDirection: 'column', paddingLeft: optionIndent + 2 }}>
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
