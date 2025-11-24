/**
 * Main MultipleChoiceForm component - Orchestration layer
 * Refactored from 399 lines to ~150 lines with clear separation of concerns
 */

import React, { useState, useMemo, useCallback } from 'react'
import { TextAttributes } from '@opentui/core'
import { useTheme } from '../../hooks/use-theme'
import type { AskUserQuestion } from '../../state/chat-store'
import { useFocusManager, useFocusActions } from './hooks/use-focus-manager'
import { useAutoAdvance } from './hooks/use-auto-advance'
import { useKeyboardNavigation } from './hooks/use-keyboard-navigation'
import { useHasRoomForInlineButtons } from './hooks/use-layout-mode'
import { QuestionHeader } from './components/question-header'
import { QuestionOption } from './components/question-option'
import { OtherTextInput } from './components/other-text-input'
import { SkipButton } from './components/skip-button'
import { isQuestionAnswered, areAllQuestionsAnswered, isFocusOnSkip, isFocusOnOption, isFocusOnTextInput } from './types'

export interface MultipleChoiceFormProps {
  questions: AskUserQuestion[]
  selectedAnswers: (number | number[])[]
  otherTexts: string[]
  onSelectAnswer: (questionIndex: number, optionIndex: number) => void
  onOtherTextChange: (questionIndex: number, text: string) => void
  onSubmit: (finalAnswers?: (number | number[])[], finalOtherTexts?: string[]) => void
  onSkip: () => void
  width: number
}

export const MultipleChoiceForm: React.FC<MultipleChoiceFormProps> = ({
  questions,
  selectedAnswers,
  otherTexts,
  onSelectAnswer,
  onOtherTextChange,
  onSubmit,
  onSkip,
  width,
}) => {
  const theme = useTheme()
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isSkipHovered, setIsSkipHovered] = useState(false)

  // Computed values
  const currentQuestion = questions[currentQuestionIndex]
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const isFirstQuestion = currentQuestionIndex === 0

  const answeredStates = useMemo(
    () => questions.map((_, i) => isQuestionAnswered(selectedAnswers[i], otherTexts[i])),
    [questions, selectedAnswers, otherTexts]
  )

  const allAnswered = useMemo(
    () => areAllQuestionsAnswered(selectedAnswers, otherTexts),
    [selectedAnswers, otherTexts]
  )

  const hasRoomForInlineButtons = useHasRoomForInlineButtons(width)

  // Focus management
  const { focus, dispatch: dispatchFocus } = useFocusManager(questions, currentQuestionIndex)
  const focusActions = useFocusActions(dispatchFocus)

  // Auto-advance logic
  // Cast to AnswerState[] for the hook (Phase 1: always number, Phase 2: number | number[])
  const { handleSelection, handleTextInputAdvance, forceSubmit } = useAutoAdvance({
    isLastQuestion,
    currentQuestionIndex,
    currentQuestion,
    selectedAnswers: selectedAnswers as (number | number[])[],
    otherTexts,
    onSubmit: (answers, texts) => {
      // Cast back to number[] for Phase 1 callback
      onSubmit(answers as number[], texts)
    },
    onAdvanceQuestion: useCallback(() => {
      setCurrentQuestionIndex((idx) => idx + 1)
      focusActions.resetToQuestion(currentQuestionIndex + 1)
    }, [focusActions, currentQuestionIndex]),
  })

  // Wrapper for onSelectAnswer that handles both state update and auto-advance
  const handleOptionSelect = useCallback(
    (questionIndex: number, optionIndex: number) => {
      onSelectAnswer(questionIndex, optionIndex)
      handleSelection(optionIndex)
    },
    [onSelectAnswer, handleSelection]
  )

  // Keyboard navigation
  useKeyboardNavigation({
    focus,
    dispatchFocus,
    currentQuestionIndex,
    totalQuestions: questions.length,
    currentQuestion,
    isFirstQuestion,
    isLastQuestion,
    selectedAnswers: selectedAnswers as (number | number[])[],
    otherTexts,
    onSelectAnswer,
    onOtherTextChange,
    onChangeQuestion: (newIndex) => {
      setCurrentQuestionIndex(newIndex)
    },
    onSubmit: (answers, texts) => {
      onSubmit(answers as number[], texts)
    },
    onSkip,
    onAutoAdvance: handleSelection,
    onTextInputAdvance: handleTextInputAdvance,
    onForceSubmit: forceSubmit,
  })

  // Check if skip button is focused
  const isSkipFocused = isFocusOnSkip(focus)

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      {/* Header with progress */}
      <QuestionHeader
        currentIndex={currentQuestionIndex}
        totalQuestions={questions.length}
        answeredStates={answeredStates}
        allAnswered={allAnswered}
        onSkip={onSkip}
        skipButtonFocused={isSkipFocused}
        skipButtonHovered={isSkipHovered}
        onSkipMouseOver={() => {
          setIsSkipHovered(true)
          focusActions.selectSkip()
        }}
        onSkipMouseOut={() => setIsSkipHovered(false)}
        hasRoomForInlineButtons={hasRoomForInlineButtons}
      />

      {/* Question content */}
      <box style={{ flexDirection: 'column', gap: 1, marginTop: 1 }}>
        <text
          style={{
            fg: theme.foreground,
            attributes: TextAttributes.BOLD,
            marginBottom: 1,
          }}
        >
          {currentQuestion.question}
        </text>

        {/* Options */}
        <box style={{ flexDirection: 'column', paddingLeft: 1, gap: 0 }}>
          {currentQuestion.options.map((opt, optIdx) => {
            const currentAnswer = selectedAnswers[currentQuestionIndex]
            const isSelected = Array.isArray(currentAnswer)
              ? currentAnswer.includes(optIdx) // Multi-select: check if array includes this option
              : currentAnswer === optIdx // Single-select: direct equality check
            const isFocused =
              isFocusOnOption(focus) &&
              focus.questionIndex === currentQuestionIndex &&
              focus.optionIndex === optIdx

            return (
              <QuestionOption
                key={optIdx}
                option={opt}
                optionIndex={optIdx}
                isSelected={isSelected}
                isFocused={isFocused}
                isMultiSelect={currentQuestion.multiSelect}
                onSelect={() => handleOptionSelect(currentQuestionIndex, optIdx)}
                onMouseOver={() => focusActions.selectOption(currentQuestionIndex, optIdx)}
              />
            )
          })}

          {/* "Other" text input */}
          <OtherTextInput
            text={otherTexts[currentQuestionIndex] || ''}
            isFocused={
              isFocusOnTextInput(focus) && focus.questionIndex === currentQuestionIndex
            }
            hasText={!!otherTexts[currentQuestionIndex]?.trim()}
            isSelected={false}
            onClick={() => focusActions.selectTextInput(currentQuestionIndex)}
            onMouseOver={() => focusActions.selectTextInput(currentQuestionIndex)}
          />
        </box>
      </box>

      {/* Skip button (if no room for inline) */}
      {!hasRoomForInlineButtons && (
        <box
          style={{
            flexDirection: 'row',
            gap: 2,
            marginTop: 2,
            justifyContent: 'center',
          }}
        >
          <SkipButton
            onClick={onSkip}
            isFocused={isSkipFocused}
            isHovered={isSkipHovered}
            onMouseOver={() => {
              setIsSkipHovered(true)
              focusActions.selectSkip()
            }}
            onMouseOut={() => setIsSkipHovered(false)}
          />
        </box>
      )}
    </box>
  )
}
