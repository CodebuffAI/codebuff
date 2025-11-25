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
import { isQuestionAnswered, areAllQuestionsAnswered, isFocusOnSkip, isFocusOnOption, isFocusOnTextInput, isFocusOnConfirmSubmit, isFocusOnConfirmBack } from './types'
import { ConfirmScreen, type AnswerSummary } from './components/confirm-screen'

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
  const [isOnConfirmScreen, setIsOnConfirmScreen] = useState(false)
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
    onSkip,
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

  // Check if skip button is focused
  const isSkipFocused = isFocusOnSkip(focus)
  const isConfirmSubmitFocused = isFocusOnConfirmSubmit(focus)
  const isConfirmBackFocused = isFocusOnConfirmBack(focus)

  // Build answer summary for confirm screen
  const answerSummary: AnswerSummary[] = useMemo(() => {
    return questions.map((q, i) => {
      const answer = selectedAnswers[i]
      const otherText = otherTexts[i]?.trim()
      
      let answerText: string
      if (otherText) {
        answerText = otherText
      } else if (Array.isArray(answer)) {
        // Multi-select
        const selectedLabels = answer.map(idx => {
          const opt = q.options[idx]
          return typeof opt === 'string' ? opt : opt.label
        })
        answerText = selectedLabels.join(', ') || '(none)'
      } else if (answer >= 0 && answer < q.options.length) {
        // Single-select
        const opt = q.options[answer]
        answerText = typeof opt === 'string' ? opt : opt.label
      } else {
        answerText = '(none)'
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
        allAnswered={allAnswered}
        isOnConfirmScreen={isOnConfirmScreen}
        onSkip={onSkip}
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
          if (isLastQuestion && allAnswered) {
            setIsOnConfirmScreen(true)
            focusActions.resetToConfirm()
          } else if (!isLastQuestion) {
            const newIndex = currentQuestionIndex + 1
            setCurrentQuestionIndex(newIndex)
            focusActions.resetToQuestion(newIndex)
          }
        }}
        skipButtonFocused={isSkipFocused}
        skipButtonHovered={isSkipHovered}
        onSkipMouseOver={() => {
          setIsSkipHovered(true)
          focusActions.selectSkip()
        }}
        onSkipMouseOut={() => setIsSkipHovered(false)}
        hasRoomForInlineButtons={hasRoomForInlineButtons}
      />

      {/* Question content or Confirm screen */}
      {isOnConfirmScreen ? (
        <box style={{ flexDirection: 'column', gap: 1, marginTop: 1 }}>
          <ConfirmScreen
            onSubmit={() => onSubmit(selectedAnswers as number[], otherTexts)}
            onBack={() => {
              setIsOnConfirmScreen(false)
              focusActions.resetToQuestion(questions.length - 1)
            }}
            submitFocused={isConfirmSubmitFocused}
            backFocused={isConfirmBackFocused}
            onSubmitMouseOver={() => focusActions.selectConfirmSubmit()}
            onBackMouseOver={() => focusActions.selectConfirmBack()}
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
              onClick={() => focusActions.selectTextInput(currentQuestionIndex)}
              onMouseOver={() => focusActions.selectTextInput(currentQuestionIndex)}
            />
          </box>
        </box>
      )}

      {/* Skip button (if no room for inline and not on confirm screen) */}
      {!hasRoomForInlineButtons && !isOnConfirmScreen && (
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
