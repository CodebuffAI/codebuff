import React, { useCallback, useState, useEffect, useMemo } from 'react'
import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { Button } from './button'
import { BORDER_CHARS } from '../utils/ui-constants'
import type { AskUserQuestion } from '../state/chat-store'

interface MultipleChoiceFormProps {
  questions: AskUserQuestion[]
  selectedAnswers: number[]
  otherTexts: string[]
  onSelectAnswer: (questionIndex: number, optionIndex: number) => void
  onOtherTextChange: (questionIndex: number, text: string) => void
  onSubmit: (finalAnswers?: number[], finalOtherTexts?: string[]) => void
  onSkip: () => void
  width: number
}

type FocusTarget =
  | { type: 'option'; questionIndex: number; optionIndex: number }
  | { type: 'textInput'; questionIndex: number }
  | { type: 'skip' }

export const MultipleChoiceForm = ({
  questions,
  selectedAnswers,
  otherTexts,
  onSelectAnswer,
  onOtherTextChange,
  onSubmit,
  onSkip,
  width,
}: MultipleChoiceFormProps) => {
  const theme = useTheme()
  const { terminalHeight } = useTerminalDimensions()
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [focusTarget, setFocusTarget] = useState<FocusTarget>({ type: 'option', questionIndex: 0, optionIndex: 0 })
  const [isSkipHovered, setIsSkipHovered] = useState(false)

  const allAnswered = selectedAnswers.every((idx, i) => idx !== -1 || otherTexts[i]?.trim())
  const currentQuestion = questions[currentQuestionIndex]
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const isFirstQuestion = currentQuestionIndex === 0


  // Determine if we have enough width for buttons on same line (need ~50 chars)
  const hasRoomForInlineButtons = width >= 55

  // Keyboard navigation
  useKeyboard(
    useCallback(
      (key) => {
        // Left arrow - previous question
        if (key.name === 'left' && !key.ctrl && !key.meta && !key.shift) {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          if (!isFirstQuestion) {
            setCurrentQuestionIndex((idx) => idx - 1)
            setFocusTarget({ type: 'option', questionIndex: currentQuestionIndex - 1, optionIndex: 0 })
          }
          return
        }

        // Right arrow - next question
        if (key.name === 'right' && !key.ctrl && !key.meta && !key.shift) {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          if (!isLastQuestion) {
            setCurrentQuestionIndex((idx) => idx + 1)
            setFocusTarget({ type: 'option', questionIndex: currentQuestionIndex + 1, optionIndex: 0 })
          }
          return
        }

        // Up arrow - navigate to previous option in current question
        if (key.name === 'up' && !key.ctrl && !key.meta && !key.shift) {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          setFocusTarget((current) => {
            if (current.type === 'skip') {
              // Go to text input
              return { type: 'textInput', questionIndex: currentQuestionIndex }
            } else if (current.type === 'textInput') {
              // Go to last option
              return { type: 'option', questionIndex: currentQuestionIndex, optionIndex: currentQuestion.options.length - 1 }
            } else if (current.type === 'option' && current.optionIndex > 0) {
              return { type: 'option', questionIndex: currentQuestionIndex, optionIndex: current.optionIndex - 1 }
            }
            return current
          })
          return
        }

        // Down arrow - navigate to next option in current question
        if (key.name === 'down' && !key.ctrl && !key.meta && !key.shift) {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          setFocusTarget((current) => {
            if (current.type === 'skip') {
              return { type: 'option', questionIndex: currentQuestionIndex, optionIndex: 0 }
            } else if (current.type === 'textInput') {
              // Go to skip
              return { type: 'skip' }
            } else if (current.type === 'option' && current.optionIndex < currentQuestion.options.length - 1) {
              return { type: 'option', questionIndex: currentQuestionIndex, optionIndex: current.optionIndex + 1 }
            } else if (current.type === 'option') {
              // At last option, go to text input
              return { type: 'textInput', questionIndex: currentQuestionIndex }
            }
            return current
          })
          return
        }

        // Tab - cycle between options, text input, and skip
        if (key.name === 'tab' && !key.ctrl && !key.meta && !key.shift) {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          setFocusTarget((current) => {
            if (current.type === 'option') {
              return { type: 'textInput', questionIndex: currentQuestionIndex }
            } else if (current.type === 'textInput') {
              return { type: 'skip' }
            } else {
              return { type: 'option', questionIndex: currentQuestionIndex, optionIndex: 0 }
            }
          })
          return
        }

        // Enter or Space - select current option or activate button
        if ((key.name === 'return' || key.name === 'enter' || key.name === 'space') && !key.ctrl && !key.meta && !key.shift) {
          // Don't handle space in text input mode (allow typing spaces)
          if (focusTarget.type === 'textInput' && key.name === 'space') {
            return
          }
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          if (focusTarget.type === 'option') {
            // First, record the answer
            onSelectAnswer(focusTarget.questionIndex, focusTarget.optionIndex)

            // Auto-advance to next question if not last
            if (!isLastQuestion) {
              setTimeout(() => {
                setCurrentQuestionIndex((idx) => idx + 1)
                setFocusTarget({ type: 'option', questionIndex: currentQuestionIndex + 1, optionIndex: 0 })
              }, 150)
            } else {
              // On last question, check if all questions will be answered after this selection
              // Create a copy of selectedAnswers with the new answer applied
              const updatedAnswers = [...selectedAnswers]
              updatedAnswers[focusTarget.questionIndex] = focusTarget.optionIndex
              const willBeAllAnswered = updatedAnswers.every((answer, i) => answer !== -1 || otherTexts[i]?.trim())

              if (willBeAllAnswered) {
                // Submit immediately with the final answers array to avoid state timing issues
                onSubmit(updatedAnswers, otherTexts)
              }
            }
          } else if (focusTarget.type === 'textInput') {
            // Enter in text input: if has text, advance or submit
            const currentOtherText = otherTexts[currentQuestionIndex]?.trim()
            if (currentOtherText) {
              if (!isLastQuestion) {
                setCurrentQuestionIndex((idx) => idx + 1)
                setFocusTarget({ type: 'option', questionIndex: currentQuestionIndex + 1, optionIndex: 0 })
              } else {
                // Check if all answered
                const willBeAllAnswered = selectedAnswers.every((answer, i) => answer !== -1 || otherTexts[i]?.trim())
                if (willBeAllAnswered) {
                  onSubmit(selectedAnswers, otherTexts)
                }
              }
            }
          } else if (focusTarget.type === 'skip') {
            onSkip()
          }
          return
        }

        // Ctrl/Cmd + Enter - submit from anywhere if all answered
        if ((key.name === 'return' || key.name === 'enter') && (key.ctrl || key.meta) && !key.shift) {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
          if (allAnswered) {
            onSubmit(selectedAnswers, otherTexts)
          }
          return
        }

        // Handle backspace in text input
        if (key.name === 'backspace' && focusTarget.type === 'textInput') {
          const currentText = otherTexts[currentQuestionIndex] || ''
          onOtherTextChange(currentQuestionIndex, currentText.slice(0, -1))
          return
        }

        // Handle typing in text input
        if (focusTarget.type === 'textInput' && key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          const currentText = otherTexts[currentQuestionIndex] || ''
          onOtherTextChange(currentQuestionIndex, currentText + key.sequence)
          return
        }
      },
      [currentQuestionIndex, currentQuestion, focusTarget, onSelectAnswer, onOtherTextChange, onSubmit, onSkip, allAnswered, isFirstQuestion, isLastQuestion, selectedAnswers, otherTexts]
    )
  )

  const isSkipFocused = focusTarget.type === 'skip'

  const skipButton = (
    <Button
      onClick={onSkip}
      onMouseOver={() => { setIsSkipHovered(true); setFocusTarget({ type: 'skip' }) }}
      onMouseOut={() => setIsSkipHovered(false)}
      style={{
        borderStyle: 'single',
        borderColor: (isSkipHovered || isSkipFocused) ? theme.error : theme.secondary,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: isSkipFocused ? theme.surface : undefined,
      }}
    >
      <text style={{ 
        fg: (isSkipHovered || isSkipFocused) ? theme.error : theme.muted,
        attributes: (isSkipHovered || isSkipFocused) ? TextAttributes.BOLD : undefined,
      }}>
        Skip
      </text>
    </Button>
  )

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <box style={{ flexDirection: 'row', gap: 0 }}>
            <text style={{ fg: theme.secondary }}>
              Question {currentQuestionIndex + 1} of {questions.length}
            </text>
            {questions.length > 1 && (
              <text style={{ fg: theme.muted }}> (← → to navigate)</text>
            )}
          </box>
          {questions.length > 1 && (
            <box style={{ flexDirection: 'row', gap: 1, marginTop: 0 }}>
              {questions.map((_, idx) => {
                const isAnswered = selectedAnswers[idx] !== -1 || otherTexts[idx]?.trim()
                const isCurrent = idx === currentQuestionIndex
                return (
                  <text key={idx} style={{
                    fg: isAnswered ? theme.primary : isCurrent ? theme.foreground : theme.muted
                  }}>
                    {isAnswered ? '✓' : isCurrent ? '●' : '○'}
                  </text>
                )
              })}
              {allAnswered && (
                <text style={{ fg: theme.primary, marginLeft: 1 }}>Complete! ✓</text>
              )}
            </box>
          )}
        </box>
        {hasRoomForInlineButtons && (
          <box style={{ flexDirection: 'row', gap: 2 }}>
            {skipButton}
          </box>
        )}
      </box>
      
      <box style={{ flexDirection: 'column', gap: 1, marginTop: 1 }}>
        <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD, marginBottom: 1 }}>
          {currentQuestion.question}
        </text>

        <box style={{ flexDirection: 'column', paddingLeft: 1, gap: 0 }}>
          {currentQuestion.options.map((opt, optIdx) => {
            const isSelected = selectedAnswers[currentQuestionIndex] === optIdx
            const isFocused =
              focusTarget.type === 'option' &&
              focusTarget.questionIndex === currentQuestionIndex &&
              focusTarget.optionIndex === optIdx

            // Extract label (handles both string and object formats)
            const label = typeof opt === 'string' ? opt : opt.label

            return (
              <Button
                key={optIdx}
                onClick={() => {
                  onSelectAnswer(currentQuestionIndex, optIdx)
                  // Auto-advance to next question
                  if (!isLastQuestion) {
                    setTimeout(() => {
                      setCurrentQuestionIndex((idx) => idx + 1)
                      setFocusTarget({ type: 'option', questionIndex: currentQuestionIndex + 1, optionIndex: 0 })
                    }, 150)
                  } else {
                    // On last question, check if all questions will be answered after this selection
                    const updatedAnswers = [...selectedAnswers]
                    updatedAnswers[currentQuestionIndex] = optIdx
                    // Clear otherText for this question since we selected an option
                    const updatedOtherTexts = [...otherTexts]
                    updatedOtherTexts[currentQuestionIndex] = ''
                    const willBeAllAnswered = updatedAnswers.every((answer, i) => answer !== -1 || updatedOtherTexts[i]?.trim())

                    if (willBeAllAnswered) {
                      // Submit immediately with the final answers array to avoid state timing issues
                      onSubmit(updatedAnswers, updatedOtherTexts)
                    }
                  }
                }}
                onMouseOver={() => setFocusTarget({ type: 'option', questionIndex: currentQuestionIndex, optionIndex: optIdx })}
                style={{
                  flexDirection: 'row',
                  gap: 1,
                  backgroundColor: isFocused ? theme.surface : undefined,
                  marginBottom: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              >
                <text style={{
                  fg: isSelected ? theme.primary : isFocused ? theme.foreground : theme.muted,
                  attributes: isFocused ? TextAttributes.BOLD : undefined,
                }}>
                  {isSelected ? '●' : '○'}
                </text>
                <text style={{
                  fg: isSelected ? theme.primary : isFocused ? theme.foreground : theme.muted,
                  attributes: isFocused ? TextAttributes.BOLD : undefined,
                }}>
                  {label}
                </text>
              </Button>
            )
          })}

          {/* "Other" text input field */}
          {(() => {
            const isTextInputFocused = focusTarget.type === 'textInput' && focusTarget.questionIndex === currentQuestionIndex
            const hasOtherText = !!otherTexts[currentQuestionIndex]?.trim()
            const currentOtherText = otherTexts[currentQuestionIndex] || ''

            return (
              <Button
                onClick={() => setFocusTarget({ type: 'textInput', questionIndex: currentQuestionIndex })}
                onMouseOver={() => setFocusTarget({ type: 'textInput', questionIndex: currentQuestionIndex })}
                style={{
                  flexDirection: 'row',
                  gap: 1,
                  backgroundColor: isTextInputFocused ? theme.surface : undefined,
                  marginTop: 1,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              >
                <text style={{
                  fg: hasOtherText ? theme.primary : isTextInputFocused ? theme.foreground : theme.muted,
                  attributes: isTextInputFocused ? TextAttributes.BOLD : undefined,
                }}>
                  {hasOtherText ? '●' : '○'}
                </text>
                <text style={{
                  fg: isTextInputFocused ? theme.foreground : theme.muted,
                  attributes: isTextInputFocused ? TextAttributes.BOLD : undefined,
                }}>
                  Other:
                </text>
                <text style={{
                  fg: hasOtherText ? theme.primary : theme.muted,
                  attributes: isTextInputFocused ? TextAttributes.BOLD : undefined,
                }}>
                  {currentOtherText || (isTextInputFocused ? '|' : 'Type your own answer...')}
                  {isTextInputFocused && currentOtherText ? '|' : ''}
                </text>
              </Button>
            )
          })()}
        </box>
      </box>

      {!hasRoomForInlineButtons && (
        <box style={{ flexDirection: 'row', gap: 2, marginTop: 2, justifyContent: 'center' }}>
          {skipButton}
        </box>
      )}
    </box>
  )
}
