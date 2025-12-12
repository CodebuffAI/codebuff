/**
 * Ask User Tool - Multiple choice form with accordion-style FAQ layout
 *
 * Shows all questions at once, each expandable to reveal options.
 */

import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useMemo, useCallback, useEffect } from 'react'

import type { KeyEvent } from '@opentui/core'

import {
  AccordionQuestion,
  type AccordionAnswer,
} from './components/accordion-question'
import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { Button } from '../button'

import type { AskUserQuestion } from '../../state/chat-store'

/** Option type - can be string or object with label/description */
type AskUserOption = string | { label: string; description?: string }

/** Constant for the "Other" option index */
const OTHER_OPTION_INDEX = -1

/** Helper to extract label from an option (handles both string and object formats) */
const getOptionLabel = (option: AskUserOption): string => {
  return typeof option === 'string' ? option : option?.label ?? ''
}

/** Helper to check if an answer is valid for a given question */
const isAnswerValid = (
  answer: AccordionAnswer | undefined,
  question: AskUserQuestion,
): boolean => {
  if (!answer) return false

  // "Other" answer needs non-empty text
  if (answer.isOther) {
    return (answer.otherText?.trim().length ?? 0) > 0
  }

  // Multi-select needs at least one selection
  if (question.multiSelect) {
    return (answer.selectedIndices?.size ?? 0) > 0
  }

  // Single-select needs a selected index
  return answer.selectedIndex !== undefined
}

export interface MultipleChoiceFormProps {
  questions: AskUserQuestion[]
  onSubmit: (answers: { question: string; answer: string }[]) => void
  onSkip: () => void
}

export const MultipleChoiceForm: React.FC<MultipleChoiceFormProps> = ({
  questions,
  onSubmit,
  onSkip,
}) => {
  const theme = useTheme()

  // Track which question is currently expanded (null = none)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    // Start with first unanswered question expanded, or first question
    0,
  )

  // Track answers for each question
  const [answers, setAnswers] = useState<Map<number, AccordionAnswer>>(
    new Map(),
  )

  // Track focused option within expanded question
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number | null>(
    null,
  )

  // Track which question has keyboard focus
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState<number>(0)

  // Track if submit button has focus (Tab navigation)
  const [submitFocused, setSubmitFocused] = useState<boolean>(false)

  // Track if user is typing in "Other" text input
  const [isTypingOther, setIsTypingOther] = useState<boolean>(false)

  // Track cursor position for "Other" text input (per question)
  const [otherCursorPositions, setOtherCursorPositions] = useState<Map<number, number>>(
    new Map(),
  )

  // Check if all questions are answered
  const allAnswered = useMemo(() => {
    return questions.every((question: AskUserQuestion, index: number) => {
      return isAnswerValid(answers.get(index), question)
    })
  }, [questions, answers])

  // Find next unanswered question index (checks for valid answers, not just existence)
  const findNextUnanswered = useCallback(
    (afterIndex: number): number | null => {
      for (let i = afterIndex + 1; i < questions.length; i++) {
        if (!isAnswerValid(answers.get(i), questions[i])) return i
      }
      // Wrap around
      for (let i = 0; i < afterIndex; i++) {
        if (!isAnswerValid(answers.get(i), questions[i])) return i
      }
      return null
    },
    [questions, answers],
  )

  const setAnswerForQuestion = useCallback(
    (
      questionIndex: number,
      updater: (previous: AccordionAnswer | undefined) => AccordionAnswer,
    ) => {
      setAnswers((prev) => {
        const nextAnswers = new Map(prev)
        const previousAnswer = prev.get(questionIndex)
        nextAnswers.set(questionIndex, updater(previousAnswer))
        return nextAnswers
      })
    },
    [],
  )

  const goToNextUnanswered = useCallback(
    (questionIndex: number) => {
      const nextUnanswered = findNextUnanswered(questionIndex)
      setExpandedIndex(nextUnanswered)
    },
    [findNextUnanswered],
  )

  // Handle setting "Other" text (with cursor position)
  const handleSetOtherText = useCallback(
    (questionIndex: number, text: string, cursorPosition: number) => {
      setAnswerForQuestion(questionIndex, (currentAnswer) => ({
        ...currentAnswer,
        isOther: true,
        otherText: text,
      }))
      setOtherCursorPositions((prev) => {
        const newPositions = new Map(prev)
        newPositions.set(questionIndex, cursorPosition)
        return newPositions
      })
    },
    [setAnswerForQuestion],
  )

  // Handle "Other" text submit (Enter key)
  const handleOtherSubmit = useCallback(
    (questionIndex: number) => {
      const currentAnswer = answers.get(questionIndex)
      const currentText = currentAnswer?.otherText || ''
      
      setIsTypingOther(false)
      // If text is entered, move to next question
      if (currentText.trim()) {
        goToNextUnanswered(questionIndex)
      }
    },
    [answers, goToNextUnanswered],
  )

  // Handle "Other" text cancel (Escape key) - deselect Custom option entirely
  const handleOtherCancel = useCallback(
    (questionIndex: number) => {
      // Clear text, deselect "Custom" option, and exit typing mode
      setAnswerForQuestion(questionIndex, (currentAnswer) => ({
        ...currentAnswer,
        isOther: false,
        otherText: '',
      }))
      setOtherCursorPositions((prev) => {
        const newPositions = new Map(prev)
        newPositions.set(questionIndex, 0)
        return newPositions
      })
      setIsTypingOther(false)
    },
    [setAnswerForQuestion],
  )

  // Handle selecting an option (single-select)
  const handleSelectOption = useCallback(
    (questionIndex: number, optionIndex: number) => {
      const isOtherOption = optionIndex === OTHER_OPTION_INDEX
      setAnswerForQuestion(questionIndex, (currentAnswer) =>
        isOtherOption
          ? {
              ...currentAnswer,
              isOther: true,
              otherText: currentAnswer?.otherText || '',
            }
          : {
              selectedIndex: optionIndex,
              isOther: false,
            },
      )

      // For "Other" option, enter typing mode
      if (isOtherOption) {
        setIsTypingOther(true)
      } else {
        // For regular options, collapse and move to next unanswered
        goToNextUnanswered(questionIndex)
      }
    },
    [goToNextUnanswered, setAnswerForQuestion],
  )

  // Handle toggling an option (multi-select)
  const handleToggleOption = useCallback(
    (questionIndex: number, optionIndex: number) => {
      let toggledOtherOn = false

      setAnswers((prev) => {
        const newAnswers = new Map(prev)
        const currentAnswer = prev.get(questionIndex)

        if (optionIndex === OTHER_OPTION_INDEX) {
          toggledOtherOn = !(currentAnswer?.isOther ?? false)
          newAnswers.set(questionIndex, {
            ...currentAnswer,
            selectedIndices: new Set(currentAnswer?.selectedIndices ?? []),
            isOther: !currentAnswer?.isOther,
            otherText: currentAnswer?.otherText || '',
          })
          return newAnswers
        }

        const newIndices = new Set(currentAnswer?.selectedIndices ?? [])
        if (newIndices.has(optionIndex)) {
          newIndices.delete(optionIndex)
        } else {
          newIndices.add(optionIndex)
        }
        newAnswers.set(questionIndex, {
          ...currentAnswer,
          selectedIndices: newIndices,
          isOther: currentAnswer?.isOther ?? false,
        })
        return newAnswers
      })

      // For "Other" option in multi-select, also enter typing mode
      if (optionIndex === OTHER_OPTION_INDEX) {
        setIsTypingOther(toggledOtherOn)
      }
    },
    [],
  )

  const formatAnswer = useCallback(
    (
      question: AskUserQuestion,
      answer: AccordionAnswer | undefined,
    ) => {
      if (!answer) {
        return { question: question.question, answer: 'Skipped' }
      }

      const selectedOptions = question.multiSelect
        ? Array.from(answer.selectedIndices ?? [])
            .map((idx: number) => getOptionLabel(question.options[idx]))
            .filter(Boolean)
        : answer.selectedIndex !== undefined
          ? [getOptionLabel(question.options[answer.selectedIndex])]
          : []

      const customText =
        answer.isOther && (answer.otherText?.trim().length ?? 0) > 0
          ? (answer.otherText ?? '').trim()
          : ''

      const parts = customText ? [...selectedOptions, customText] : selectedOptions
      if (parts.length === 0) {
        return { question: question.question, answer: 'Skipped' }
      }

      return {
        question: question.question,
        answer: question.multiSelect ? parts.join(', ') : parts[0],
      }
    },
    [],
  )

  // Handle submit
  const handleSubmit = useCallback(() => {
    const formattedAnswers = questions.map(
      (question: AskUserQuestion, index: number) => {
        return formatAnswer(question, answers.get(index))
      },
    )

    onSubmit(formattedAnswers)
  }, [questions, answers, onSubmit, formatAnswer])

  // Keyboard navigation using OpenTUI's useKeyboard hook
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        // Helper to prevent default behavior
        const preventDefault = () => {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
        }

        // When typing in "Other" input, let MultilineInput handle all keyboard input
        if (isTypingOther) {
          return
        }

        // Handle submit button focus
        if (submitFocused) {
          if (key.name === 'tab' && key.shift) {
            preventDefault()
            setSubmitFocused(false)
            setFocusedQuestionIndex(questions.length - 1)
            return
          }
          if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
            preventDefault()
            if (allAnswered) {
              handleSubmit()
            }
            return
          }
          return
        }

        const isQuestionExpanded = expandedIndex === focusedQuestionIndex
        const currentQuestion = questions[focusedQuestionIndex]
        const optionCount = currentQuestion
          ? currentQuestion.options.length + 1
          : 0

        if (key.name === 'down') {
          preventDefault()
          if (isQuestionExpanded && focusedOptionIndex !== null) {
            setFocusedOptionIndex(
              Math.min(focusedOptionIndex + 1, optionCount - 1),
            )
          } else if (isQuestionExpanded && focusedOptionIndex === null) {
            setFocusedOptionIndex(0)
          } else {
            setFocusedQuestionIndex(
              Math.min(focusedQuestionIndex + 1, questions.length - 1),
            )
          }
          return
        }

        if (key.name === 'up') {
          preventDefault()
          if (isQuestionExpanded && focusedOptionIndex !== null) {
            if (focusedOptionIndex > 0) {
              setFocusedOptionIndex(focusedOptionIndex - 1)
            } else {
              setFocusedOptionIndex(null)
            }
          } else {
            setFocusedQuestionIndex(Math.max(focusedQuestionIndex - 1, 0))
          }
          return
        }

        if (key.name === 'right') {
          preventDefault()
          if (expandedIndex !== focusedQuestionIndex) {
            setExpandedIndex(focusedQuestionIndex)
            setFocusedOptionIndex(0)
          }
          return
        }

        if (key.name === 'left') {
          preventDefault()
          if (expandedIndex !== null) {
            setExpandedIndex(null)
            setFocusedOptionIndex(null)
          }
          return
        }

        if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
          preventDefault()
          if (isQuestionExpanded && focusedOptionIndex !== null) {
            const optionIdx =
              focusedOptionIndex >= currentQuestion.options.length
                ? OTHER_OPTION_INDEX
                : focusedOptionIndex
            if (currentQuestion.multiSelect) {
              handleToggleOption(focusedQuestionIndex, optionIdx)
            } else {
              handleSelectOption(focusedQuestionIndex, optionIdx)
            }
          } else if (!isQuestionExpanded) {
            setExpandedIndex(focusedQuestionIndex)
            setFocusedOptionIndex(0)
          }
          return
        }

        if (key.name === 'tab' && !key.shift) {
          preventDefault()
          setExpandedIndex(null)
          setFocusedOptionIndex(null)
          setSubmitFocused(true)
          return
        }

        // Escape or Ctrl+C to skip/close the form
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          preventDefault()
          onSkip()
          return
        }
      },
      [
        questions,
        expandedIndex,
        focusedQuestionIndex,
        focusedOptionIndex,
        submitFocused,
        allAnswered,
        isTypingOther,
        handleSelectOption,
        handleToggleOption,
        handleSubmit,
        onSkip,
      ],
    ),
  )

  // Sync focusedQuestionIndex when expandedIndex changes
  useEffect(() => {
    if (expandedIndex !== null) {
      setFocusedQuestionIndex(expandedIndex)
    }
  }, [expandedIndex])

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      {/* Close button in top-right */}
      <box style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 1 }}>
        <Button
          onClick={onSkip}
          style={{
            padding: 0,
          }}
        >
          <text style={{ fg: theme.muted }}>✕</text>
        </Button>
      </box>

      {/* All questions in accordion style */}
      {questions.map((question, index) => (
        <AccordionQuestion
          key={index}
          question={question}
          questionIndex={index}
          totalQuestions={questions.length}
          answer={answers.get(index)}
          isExpanded={expandedIndex === index}
          isQuestionFocused={focusedQuestionIndex === index && !submitFocused}
          isTypingOther={isTypingOther && expandedIndex === index}
          onToggleExpand={() => {
            setExpandedIndex(expandedIndex === index ? null : index)
            setFocusedQuestionIndex(index)
            setSubmitFocused(false)
            setIsTypingOther(false)
          }}
          onSelectOption={(optionIndex) =>
            handleSelectOption(index, optionIndex)
          }
          onToggleOption={(optionIndex) =>
            handleToggleOption(index, optionIndex)
          }
          onSetOtherText={(text, cursorPos) => handleSetOtherText(index, text, cursorPos)}
          onOtherSubmit={() => handleOtherSubmit(index)}
          onOtherCancel={() => handleOtherCancel(index)}
          otherCursorPosition={otherCursorPositions.get(index) ?? 0}
          focusedOptionIndex={
            expandedIndex === index ? focusedOptionIndex : null
          }
          onFocusOption={setFocusedOptionIndex}
        />
      ))}

      {/* Submit button */}
      <box style={{ flexDirection: 'row', marginTop: 1 }}>
        <Button
          onClick={handleSubmit}
          disabled={!allAnswered}
          style={{
            borderStyle: 'single',
            borderColor: submitFocused
              ? theme.primary
              : allAnswered
                ? theme.success
                : theme.muted,
            backgroundColor: submitFocused ? theme.surface : undefined,
            customBorderChars: BORDER_CHARS,
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          <text
            style={{
              fg: submitFocused
                ? theme.primary
                : allAnswered
                  ? theme.success
                  : theme.muted,
              attributes:
                allAnswered || submitFocused ? TextAttributes.BOLD : undefined,
            }}
          >
            Submit
          </text>
        </Button>
      </box>
    </box>
  )
}
