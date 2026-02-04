/**
 * Ask User Tool - Multiple choice form with accordion-style FAQ layout
 *
 * Shows all questions at once, each expandable to reveal options.
 */

import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback, useEffect, useRef } from 'react'


import {
  AccordionQuestion,
  type AccordionAnswer,
} from './components/accordion-question'
import { getOptionLabel, KEYBOARD_HINTS, CUSTOM_OPTION_INDEX } from './constants'
import { useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { Button } from '../button'

import type { AskUserQuestion } from '../../types/store'
import type { KeyEvent } from '@opentui/core'

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
  const terminalFocused = useChatStore((state) => state.inputFocused)
  const suppressNextHoverFocusRef = useRef(false)

  // Track which question is currently expanded (null = none)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    questions.length > 0 ? 0 : null,
  )

  // Track answers for each question
  const [answers, setAnswers] = useState<Map<number, AccordionAnswer>>(
    new Map(),
  )

  // Track focused option within expanded question
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number | null>(
    questions.length > 0 ? 0 : null,
  )

  // Track which question has keyboard focus
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState<number>(0)

  // Track if submit button has focus (Tab navigation)
  const [submitFocused, setSubmitFocused] = useState<boolean>(false)

  const [submitHovered, setSubmitHovered] = useState<boolean>(false)

  const [showFocusHighlight, setShowFocusHighlight] = useState<boolean>(true)

  const [lastFocusBeforeSubmit, setLastFocusBeforeSubmit] = useState<{
    questionIndex: number
    optionIndex: number
  } | null>(null)

  // Track if user is typing in "Custom" text input
  const [isTypingCustom, setIsTypingCustom] = useState<boolean>(false)

  // Track cursor position for "Custom" text input (per question)
  const [customCursorPositions, setCustomCursorPositions] = useState<Map<number, number>>(
    new Map(),
  )

  const setAnswerForQuestion = useCallback(
    (
      questionIndex: number,
      updater: (previous: AccordionAnswer | undefined) => AccordionAnswer,
    ) => {
      setAnswers((prev) => {
        const nextAnswers = new Map(prev)
        const previousAnswer = prev.get(questionIndex) ?? {}
        nextAnswers.set(questionIndex, updater(previousAnswer))
        return nextAnswers
      })
    },
    [],
  )

  const openQuestion = useCallback((questionIndex: number, optionIndex: number) => {
    setExpandedIndex(questionIndex)
    setFocusedQuestionIndex(questionIndex)
    setFocusedOptionIndex(optionIndex)
    setSubmitFocused(false)
    setIsTypingCustom(false)
  }, [])

  const focusSubmit = useCallback(
    (from?: { questionIndex: number; optionIndex: number }) => {
      const optionIndex = from?.optionIndex ?? focusedOptionIndex ?? 0
      const questionIndex = from?.questionIndex ?? focusedQuestionIndex
      setLastFocusBeforeSubmit({ questionIndex, optionIndex })
      setSubmitFocused(true)
      setIsTypingCustom(false)
    },
    [focusedOptionIndex, focusedQuestionIndex],
  )

  // Handle setting "Custom" text (with cursor position)
  const handleSetCustomText = useCallback(
    (questionIndex: number, text: string, cursorPosition: number) => {
      setAnswerForQuestion(questionIndex, (currentAnswer) => ({
        ...currentAnswer,
        isCustom: true,
        customText: text,
      }))
      setCustomCursorPositions((prev) => {
        const newPositions = new Map(prev)
        newPositions.set(questionIndex, cursorPosition)
        return newPositions
      })
    },
    [setAnswerForQuestion],
  )

  // Handle "Custom" text submit (Enter key)
  const handleCustomSubmit = useCallback(
    (questionIndex: number) => {
      setIsTypingCustom(false)
      setSubmitFocused(false)

      if (questions[questionIndex]?.multiSelect) {
        return
      }

      if (questionIndex < questions.length - 1) {
        openQuestion(questionIndex + 1, 0)
        return
      }

      focusSubmit({
        questionIndex,
        optionIndex: questions[questionIndex]?.options.length ?? 0,
      })
    },
    [questions, openQuestion, focusSubmit],
  )

  // Handle selecting an option (single-select)
  const handleSelectOption = useCallback(
    (
      questionIndex: number,
      optionIndex: number,
      source: 'keyboard' | 'mouse' = 'keyboard',
    ) => {
      setSubmitFocused(false)
      const isCustomOption = optionIndex === CUSTOM_OPTION_INDEX

      // When clicking out of Custom typing mode, first click just exits and highlights
      // the option without selecting it (requires a second click to actually select)
      if (source === 'mouse' && isTypingCustom && !isCustomOption) {
        setIsTypingCustom(false)
        setFocusedOptionIndex(optionIndex)
        setShowFocusHighlight(true)
        // Deselect Custom option but preserve the typed text
        setAnswerForQuestion(questionIndex, (currentAnswer) => ({
          ...currentAnswer,
          isCustom: false,
        }))
        return
      }

      if (source === 'mouse' && !isCustomOption) {
        setShowFocusHighlight(false)
        suppressNextHoverFocusRef.current = true
      }

      setAnswerForQuestion(questionIndex, (currentAnswer) =>
        isCustomOption
          ? {
              // Selecting "Custom" should clear any single-select choice
              selectedIndex: undefined,
              selectedIndices: undefined,
              isCustom: true,
              customText: currentAnswer?.customText || '',
            }
          : {
              selectedIndex: optionIndex,
              selectedIndices: undefined,
              isCustom: false,
              customText: currentAnswer?.customText,  // Preserve custom text when switching away
            },
      )

      // For "Custom" option, enter typing mode
      if (isCustomOption) {
        setFocusedQuestionIndex(questionIndex)
        setFocusedOptionIndex(questions[questionIndex]?.options.length ?? 0)
        setIsTypingCustom(true)
        return
      }

      if (questionIndex < questions.length - 1) {
        openQuestion(questionIndex + 1, 0)
        return
      }

      // For last/only question, collapse to show answer summary
      setExpandedIndex(null)
      focusSubmit({ questionIndex, optionIndex })
    },
    [questions, openQuestion, focusSubmit, setAnswerForQuestion, isTypingCustom],
  )

  // Handle toggling an option (multi-select)
  const handleToggleOption = useCallback(
    (questionIndex: number, optionIndex: number) => {
      setSubmitFocused(false)
      let toggledCustomOn = false

      setAnswers((prev) => {
        const newAnswers = new Map(prev)
        const currentAnswer: AccordionAnswer = prev.get(questionIndex) ?? {}

        if (optionIndex === CUSTOM_OPTION_INDEX) {
          toggledCustomOn = !(currentAnswer?.isCustom ?? false)
          newAnswers.set(questionIndex, {
            ...currentAnswer,
            selectedIndices: new Set(currentAnswer?.selectedIndices ?? []),
            isCustom: !currentAnswer?.isCustom,
            customText: currentAnswer?.customText || '',
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
          isCustom: currentAnswer?.isCustom ?? false,
        })
        return newAnswers
      })

      // For "Custom" option in multi-select, also enter typing mode
      if (optionIndex === CUSTOM_OPTION_INDEX) {
        setIsTypingCustom(toggledCustomOn)
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
            .map((idx) => getOptionLabel(question.options[idx]))
            .filter(Boolean)
        : answer.selectedIndex !== undefined
          ? [getOptionLabel(question.options[answer.selectedIndex])]
          : []

      const customText =
        answer.isCustom && (answer.customText?.trim().length ?? 0) > 0
          ? (answer.customText ?? '').trim()
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
    const formattedAnswers = questions.map((question, index) =>
      formatAnswer(question, answers.get(index)),
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

        // Escape or Ctrl+C to skip/close the form
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          preventDefault()
          onSkip()
          return
        }

        if (!showFocusHighlight) {
          setShowFocusHighlight(true)
        }

        // Handle submit button focus
        if (submitFocused) {
          if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
            preventDefault()
            setIsTypingCustom(false)
            setSubmitFocused(false)
            if (questions.length === 0) return
            if (lastFocusBeforeSubmit) {
              openQuestion(lastFocusBeforeSubmit.questionIndex, lastFocusBeforeSubmit.optionIndex)
            } else {
              openQuestion(questions.length - 1, 0)
            }
            return
          }
          if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
            preventDefault()
            handleSubmit()
            return
          }
          return
        }

        if (key.name === 'tab' && !key.shift) {
          preventDefault()
          focusSubmit()
          return
        }

        // When typing in "Custom" input, let MultilineInput handle all keyboard input
        if (isTypingCustom) {
          return
        }

        if (questions.length === 0) {
          return
        }

        const currentQuestionIndex = Math.min(
          Math.max(focusedQuestionIndex, 0),
          questions.length - 1,
        )
        const currentQuestion = questions[currentQuestionIndex]
        const optionCount = currentQuestion.options.length + 1
        const lastOptionIndex = optionCount - 1
        const currentOptionIndex = Math.min(
          Math.max(focusedOptionIndex ?? 0, 0),
          lastOptionIndex,
        )

        if (key.name === 'right') {
          preventDefault()
          if (expandedIndex !== currentQuestionIndex) {
            openQuestion(currentQuestionIndex, 0)
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

        if (key.name === 'down') {
          preventDefault()

          if (expandedIndex === null) {
            openQuestion(currentQuestionIndex, 0)
            return
          }

          if (currentOptionIndex < lastOptionIndex) {
            setFocusedOptionIndex(currentOptionIndex + 1)
            return
          }

          if (currentQuestionIndex < questions.length - 1) {
            openQuestion(currentQuestionIndex + 1, 0)
            return
          }

          focusSubmit({
            questionIndex: currentQuestionIndex,
            optionIndex: currentOptionIndex,
          })
          return
        }

        if (key.name === 'up') {
          preventDefault()

          if (expandedIndex === null) {
            if (currentQuestionIndex > 0) {
              const previousQuestionIndex = currentQuestionIndex - 1
              const previousOptionCount =
                (questions[previousQuestionIndex]?.options.length ?? 0) + 1
              openQuestion(previousQuestionIndex, previousOptionCount - 1)
            }
            return
          }

          if (currentOptionIndex > 0) {
            setFocusedOptionIndex(currentOptionIndex - 1)
            return
          }

          if (currentQuestionIndex > 0) {
            const previousQuestionIndex = currentQuestionIndex - 1
            const previousOptionCount =
              (questions[previousQuestionIndex]?.options.length ?? 0) + 1
            openQuestion(previousQuestionIndex, previousOptionCount - 1)
          }
          return
        }

        if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
          preventDefault()

          if (expandedIndex === null) {
            openQuestion(currentQuestionIndex, 0)
            return
          }

          const optionIdx =
            currentOptionIndex === lastOptionIndex
              ? CUSTOM_OPTION_INDEX
              : currentOptionIndex
          if (currentQuestion.multiSelect) {
            handleToggleOption(currentQuestionIndex, optionIdx)
          } else {
            handleSelectOption(currentQuestionIndex, optionIdx, 'keyboard')
          }
          return
        }
      },
      [
        questions,
        expandedIndex,
        focusedQuestionIndex,
        focusedOptionIndex,
        submitFocused,
        lastFocusBeforeSubmit,
        isTypingCustom,
        showFocusHighlight,
        handleSelectOption,
        handleToggleOption,
        handleSubmit,
        onSkip,
        openQuestion,
        focusSubmit,
      ],
    ),
  )

  // Sync focusedQuestionIndex when expandedIndex changes
  useEffect(() => {
    if (expandedIndex !== null) {
      setFocusedQuestionIndex(expandedIndex)
    }
  }, [expandedIndex])

  useEffect(() => {
    if (!terminalFocused) {
      setSubmitHovered(false)
    }
  }, [terminalFocused])

  return (
    <box style={{ flexDirection: 'column', padding: 0, width: '100%' }}>
      {/* Close button in top-right */}
      <box style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 1, width: '100%' }}>
        <Button
          onClick={onSkip}
          style={{
            padding: 0,
          }}
        >
          <text style={{ fg: theme.muted }}>Close ✕</text>
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
          isTypingCustom={isTypingCustom && expandedIndex === index}
          onToggleExpand={() => {
            const nextExpandedIndex = expandedIndex === index ? null : index
            setExpandedIndex(nextExpandedIndex)
            setFocusedQuestionIndex(index)
            setSubmitFocused(false)
            setIsTypingCustom(false)
            setFocusedOptionIndex(nextExpandedIndex === null ? null : 0)
          }}
          onSelectOption={(optionIndex) =>
            handleSelectOption(index, optionIndex, 'mouse')
          }
          onToggleOption={(optionIndex) =>
            handleToggleOption(index, optionIndex)
          }
          onSetCustomText={(text, cursorPos) => handleSetCustomText(index, text, cursorPos)}
          onCustomSubmit={() => handleCustomSubmit(index)}
          customCursorPosition={customCursorPositions.get(index) ?? 0}
          focusedOptionIndex={
            expandedIndex === index && !submitFocused && showFocusHighlight
              ? focusedOptionIndex
              : null
          }
          onFocusOption={(optionIndex) => {
            if (!terminalFocused || isTypingCustom) return
            if (suppressNextHoverFocusRef.current) {
              suppressNextHoverFocusRef.current = false
              return
            }
            setShowFocusHighlight(true)
            setSubmitFocused(false)
            setFocusedQuestionIndex(index)
            if (expandedIndex !== index) {
              setExpandedIndex(index)
            }
            setFocusedOptionIndex(optionIndex)
          }}
        />
      ))}

      {/* Footer: submit + keyboard hints */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          width: '100%',
          gap: 4,
        }}
      >
        <box style={{ flexShrink: 0 }}>
          <Button
            onClick={handleSubmit}
            onMouseOver={() => {
              if (!terminalFocused) return
              setSubmitHovered(true)
            }}
            onMouseOut={() => {
              setSubmitHovered(false)
            }}
            style={{
              borderStyle: 'single',
              borderColor:
                submitFocused || (submitHovered && terminalFocused)
                  ? theme.primary
                  : theme.muted,
              customBorderChars: BORDER_CHARS,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <text
              style={{
                fg:
                  submitFocused || (submitHovered && terminalFocused)
                    ? theme.primary
                    : theme.muted,
                attributes:
                  submitFocused || (submitHovered && terminalFocused)
                    ? TextAttributes.BOLD
                    : undefined,
              }}
            >
              Submit
            </text>
          </Button>
        </box>

        <box
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {KEYBOARD_HINTS.map((hint, idx) => (
            <text
              key={hint}
              wrapMode="none"
              style={{ fg: theme.muted, marginRight: idx === KEYBOARD_HINTS.length - 1 ? 0 : 1 }}
            >
              {hint}
            </text>
          ))}
        </box>
      </box>
    </box>
  )
}
