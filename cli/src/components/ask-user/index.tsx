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

import { QuestionHeader } from './components/question-header'
import { QuestionOption } from './components/question-option'
import { OtherTextInput } from './components/other-text-input'
import { isQuestionAnswered, areAllQuestionsAnswered, isFocusOnOption, isFocusOnTextInput, isFocusOnConfirmSubmit } from './types'
import { ConfirmScreen, type AnswerSummary } from './components/confirm-screen'

export interface MultipleChoiceFormProps {
  questions: AskUserQuestion[]
  selectedAnswers: (number | number[])[]
  otherTexts: string[]
  onSelectAnswer: (questionIndex: number, optionIndex: number) => void
  onOtherTextChange: (questionIndex: number, text: string) => void
  onSubmit: (finalAnswers?: (number | number[])[], finalOtherTexts?: string[]) => void
  onQuestionChange?: (currentIndex: number, totalQuestions: number, isOnConfirmScreen: boolean) => void
  width: number
}

export const MultipleChoiceForm: React.FC<MultipleChoiceFormProps> = ({
  questions,
  selectedAnswers,
  otherTexts,
  onSelectAnswer,
  onOtherTextChange,
  onSubmit,
  onQuestionChange,
  width,
}) => {
  const theme = useTheme()
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isOnConfirmScreen, setIsOnConfirmScreen] = useState(false)
  const [otherCursorPositions, setOtherCursorPositions] = useState<number[]>(
    () => questions.map(() => 0),
  )

  // Notify parent when question changes
  React.useEffect(() => {
    onQuestionChange?.(currentQuestionIndex, questions.length, isOnConfirmScreen)
  }, [currentQuestionIndex, questions.length, isOnConfirmScreen, onQuestionChange])

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
      // Instead of auto-submitting, go to confirm screen
      setIsOnConfirmScreen(true)
      focusActions.resetToConfirm()
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
    isOnConfirmScreen,
    allAnswered,
    selectedAnswers: selectedAnswers as (number | number[])[],
    otherTexts,
    onSelectAnswer,
    onOtherTextChange,
    onChangeQuestion: (newIndex) => {
      setIsOnConfirmScreen(false)
      setCurrentQuestionIndex(newIndex)
    },
    onSubmit: (answers, texts) => {
      onSubmit(answers as number[], texts)
    },
    onAutoAdvance: handleSelection,
    onTextInputAdvance: handleTextInputAdvance,
    onForceSubmit: forceSubmit,
    onGoToConfirm: () => {
      setIsOnConfirmScreen(true)
      focusActions.resetToConfirm()
    },
    onGoBackFromConfirm: () => {
      setIsOnConfirmScreen(false)
      focusActions.resetToQuestion(questions.length - 1)
    },
  })

  const isConfirmSubmitFocused = isFocusOnConfirmSubmit(focus)

  // Build answer summary for confirm screen
  const answerSummary: AnswerSummary[] = useMemo(() => {
    return questions.map((q, i) => {
      const answer = selectedAnswers[i]
      const otherText = otherTexts[i]?.trim()
      
      let answerText: string
      if (otherText) {
        answerText = otherText
      } else if (Array.isArray(answer) && answer.length > 0) {
        // Multi-select with selections
        const selectedLabels = answer.map(idx => {
          const opt = q.options[idx]
          if (!opt) return '(invalid)'
          return typeof opt === 'string' ? opt : opt.label
        })
        answerText = selectedLabels.join(', ')
      } else if (typeof answer === 'number' && answer >= 0 && answer < q.options.length) {
        // Single-select with valid selection
        const opt = q.options[answer]
        answerText = typeof opt === 'string' ? opt : opt.label
      } else {
        answerText = '(skipped)'
      }
      
      return {
        question: q.question,
        header: q.header,
        answer: answerText,
      }
    })
  }, [questions, selectedAnswers, otherTexts])

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      {/* Header with progress */}
      <QuestionHeader
        currentIndex={currentQuestionIndex}
        totalQuestions={questions.length}
        answeredStates={answeredStates}
        isOnConfirmScreen={isOnConfirmScreen}
        onNavigate={(newIndex) => {
          setIsOnConfirmScreen(false)
          setCurrentQuestionIndex(newIndex)
          focusActions.resetToQuestion(newIndex)
        }}
        onNavigateToConfirm={() => {
          setIsOnConfirmScreen(true)
          focusActions.resetToConfirm()
        }}
        onPrev={() => {
          if (isOnConfirmScreen) {
            setIsOnConfirmScreen(false)
            focusActions.resetToQuestion(questions.length - 1)
          } else if (!isFirstQuestion) {
            const newIndex = currentQuestionIndex - 1
            setCurrentQuestionIndex(newIndex)
            focusActions.resetToQuestion(newIndex)
          }
        }}
        onNext={() => {
          if (isOnConfirmScreen) {
            // Already at the end
            return
          }
          if (isLastQuestion) {
            // Go to confirm screen regardless of whether all answered
            setIsOnConfirmScreen(true)
            focusActions.resetToConfirm()
          } else {
            const newIndex = currentQuestionIndex + 1
            setCurrentQuestionIndex(newIndex)
            focusActions.resetToQuestion(newIndex)
          }
        }}
      />

      {/* Question content or Confirm screen */}
      {isOnConfirmScreen ? (
        <box style={{ flexDirection: 'column', gap: 1, marginTop: 1 }}>
          <ConfirmScreen
            onSubmit={() => onSubmit(selectedAnswers as number[], otherTexts)}
            submitFocused={isConfirmSubmitFocused}
            onSubmitMouseOver={() => focusActions.selectConfirmSubmit()}
            answers={answerSummary}
          />
        </box>
      ) : (
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
              width={width}
              cursorPosition={
                otherCursorPositions[currentQuestionIndex] ??
                (otherTexts[currentQuestionIndex] || '').length
              }
              onClick={() => focusActions.selectTextInput(currentQuestionIndex)}
              onMouseOver={() => focusActions.selectTextInput(currentQuestionIndex)}
              onChange={({ text, cursorPosition }) => {
                onOtherTextChange(currentQuestionIndex, text)
                setOtherCursorPositions((prev) => {
                  const next = [...prev]
                  next[currentQuestionIndex] = cursorPosition
                  return next
                })
              }}
              onSubmit={handleTextInputAdvance}
            />
          </box>
        </box>
      )}

    </box>
  )
}
