import React from 'react'

import { AgentModeToggle } from './agent-mode-toggle'
import { MultipleChoiceForm } from './ask-user'
import { FeedbackContainer } from './feedback-container'
import { InputModeBanner } from './input-mode-banner'
import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { OutOfCreditsBanner } from './out-of-credits-banner'
import { PublishContainer } from './publish-container'
import { SuggestionMenu, type SuggestionItem } from './suggestion-menu'
import { useAskUserBridge } from '../hooks/use-ask-user-bridge'
import { useEvent } from '../hooks/use-event'
import { useChatStore } from '../state/chat-store'
import { getInputModeConfig } from '../utils/input-modes'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { useTheme } from '../hooks/use-theme'
import type { InputValue } from '../state/chat-store'
import type { AgentMode } from '../utils/constants'

type Theme = ReturnType<typeof useTheme>

interface ChatInputBarProps {
  // Input state
  inputValue: string
  cursorPosition: number
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
  inputFocused: boolean
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  inputPlaceholder: string
  lastEditDueToNav: boolean

  // Agent mode
  agentMode: AgentMode
  toggleAgentMode: () => void
  setAgentMode: (mode: AgentMode) => void

  // Suggestion menus
  hasSlashSuggestions: boolean
  hasMentionSuggestions: boolean
  hasSuggestionMenu: boolean
  slashSuggestionItems: SuggestionItem[]
  agentSuggestionItems: SuggestionItem[]
  fileSuggestionItems: SuggestionItem[]
  slashSelectedIndex: number
  agentSelectedIndex: number
  onSlashItemClick?: (index: number) => void
  onMentionItemClick?: (index: number) => void

  // Layout
  theme: Theme
  terminalHeight: number
  separatorWidth: number
  shouldCenterInputVertically: boolean
  inputBoxTitle: string | undefined
  isCompactHeight: boolean
  isNarrowWidth: boolean

  // Feedback mode
  feedbackMode: boolean
  handleExitFeedback: () => void

  // Publish mode
  publishMode: boolean
  handleExitPublish: () => void
  handlePublish: (agentIds: string[]) => Promise<void>

  // Handlers
  handleSubmit: () => Promise<void>
  onPaste: (fallbackText?: string) => void
}

export const ChatInputBar = ({
  inputValue,
  cursorPosition,
  setInputValue,
  inputFocused,
  inputRef,
  inputPlaceholder,
  lastEditDueToNav,
  agentMode,
  toggleAgentMode,
  setAgentMode,
  hasSlashSuggestions,
  hasMentionSuggestions,
  hasSuggestionMenu,
  slashSuggestionItems,
  agentSuggestionItems,
  fileSuggestionItems,
  slashSelectedIndex,
  agentSelectedIndex,
  onSlashItemClick,
  onMentionItemClick,
  theme,
  terminalHeight,
  separatorWidth,
  shouldCenterInputVertically,
  inputBoxTitle,
  isCompactHeight,
  isNarrowWidth,
  feedbackMode,
  handleExitFeedback,
  publishMode,
  handleExitPublish,
  handlePublish,
  handleSubmit,
  onPaste,
}: ChatInputBarProps) => {
  const inputMode = useChatStore((state) => state.inputMode)
  const setInputMode = useChatStore((state) => state.setInputMode)

  const modeConfig = getInputModeConfig(inputMode)
  const askUserState = useChatStore((state) => state.askUserState)
  const hasAnyPreview = hasSuggestionMenu
  const { submitAnswers, skip } = useAskUserBridge()
  const [askUserTitle] = React.useState(' Some questions for you ')

  // Shared key intercept handler for suggestion menu navigation and history navigation
  const handleKeyIntercept = useEvent(
    (key: {
      name?: string
      sequence?: string
      shift?: boolean
      ctrl?: boolean
      meta?: boolean
      option?: boolean
    }) => {
      const isPlainEnter =
        (key.name === 'return' || key.name === 'enter') &&
        !key.shift &&
        !key.ctrl &&
        !key.meta &&
        !key.option
      const isTab = key.name === 'tab' && !key.ctrl && !key.meta && !key.option
      const isUp = key.name === 'up' && !key.ctrl && !key.meta && !key.option
      const isDown = key.name === 'down' && !key.ctrl && !key.meta && !key.option
      const isUpDown = isUp || isDown

      const hasSuggestions = hasSlashSuggestions || hasMentionSuggestions
      if (hasSuggestions) {
        if (isUpDown && lastEditDueToNav) {
          return true
        }
        if (isPlainEnter || isTab || isUpDown) {
          return true
        }
      }

      const historyUpEnabled = lastEditDueToNav || cursorPosition === 0
      const historyDownEnabled = lastEditDueToNav || cursorPosition === inputValue.length
      if (isUp && historyUpEnabled) {
        return true
      }
      if (isDown && historyDownEnabled) {
        return true
      }

      return false
    },
  )

  if (feedbackMode) {
    return (
      <FeedbackContainer
        inputRef={inputRef}
        onExitFeedback={handleExitFeedback}
        width={separatorWidth}
      />
    )
  }

  if (publishMode) {
    return (
      <PublishContainer
        inputRef={inputRef}
        onExitPublish={handleExitPublish}
        onPublish={handlePublish}
        width={separatorWidth}
      />
    )
  }

  // Out of credits mode: replace entire input with out-of-credits banner
  if (inputMode === 'outOfCredits') {
    return <OutOfCreditsBanner />
  }

  // Handle input changes with special mode entry detection
  const handleInputChange = (value: InputValue) => {
    // Detect entering bash mode: user typed exactly '!' when in default mode
    if (inputMode === 'default' && value.text === '!') {
      // Enter bash mode and clear input
      setInputMode('bash')
      setInputValue({
        text: '',
        cursorPosition: 0,
        lastEditDueToNav: value.lastEditDueToNav,
      })
      return
    }

    // Normal input handling
    setInputValue(value)
  }

  const handleFormSubmit = (
    answers: { question: string; answer: string }[],
  ) => {
    if (!askUserState) return

    // Convert accordion-style answers to the format expected by submitAnswers
    const formattedAnswers = askUserState.questions.map((q, idx) => {
      const answerObj = answers[idx]
      if (!answerObj || answerObj.answer === 'Skipped') {
        return { questionIndex: idx }
      }

      // For multi-select questions, always use selectedOptions array format
      if (q.multiSelect) {
        // Split by ', ' to get individual options (even if just one)
        const selectedOptions = answerObj.answer.split(', ').filter(Boolean)

        // Check if all selected options match known options (not "other" text)
        const allMatchKnownOptions = selectedOptions.every((selected) =>
          q.options.some((opt) => {
            const label = typeof opt === 'string' ? opt : opt.label
            return label === selected
          }),
        )

        if (allMatchKnownOptions && selectedOptions.length > 0) {
          return {
            questionIndex: idx,
            selectedOptions,
          }
        }

        // Otherwise it's an "other" text answer for multi-select
        return {
          questionIndex: idx,
          otherText: answerObj.answer,
        }
      }

      // For single-select questions, check if the answer matches one of the options
      const matchingOptionIndex = q.options.findIndex((opt) => {
        const label = typeof opt === 'string' ? opt : opt.label
        return label === answerObj.answer
      })

      if (matchingOptionIndex >= 0) {
        return {
          questionIndex: idx,
          selectedOption: answerObj.answer,
        }
      }

      // Otherwise it's an "other" text answer
      return {
        questionIndex: idx,
        otherText: answerObj.answer,
      }
    })

    submitAnswers(formattedAnswers)
  }

  const handleFormSkip = () => {
    if (!askUserState) return
    skip()
  }

  const effectivePlaceholder =
    inputMode === 'default' ? inputPlaceholder : modeConfig.placeholder
  const borderColor = theme[modeConfig.color]

  if (askUserState) {
    return (
      <box
        title={askUserTitle}
        titleAlignment="center"
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.primary,
          customBorderChars: BORDER_CHARS,
        }}
      >
        <MultipleChoiceForm
          questions={askUserState.questions}
          onSubmit={handleFormSubmit}
          onSkip={handleFormSkip}
        />
      </box>
    )
  }

  // Compact mode: no border, minimal chrome, supports menus and multiline
  if (isCompactHeight) {
    const compactMaxHeight = Math.floor(terminalHeight / 2)
    return (
      <>
        {hasSlashSuggestions ? (
          <SuggestionMenu
            items={slashSuggestionItems}
            selectedIndex={slashSelectedIndex}
            maxVisible={5}
            prefix="/"
            onItemClick={onSlashItemClick}
          />
        ) : null}
        {hasMentionSuggestions ? (
          <SuggestionMenu
            items={[...agentSuggestionItems, ...fileSuggestionItems]}
            selectedIndex={agentSelectedIndex}
            maxVisible={5}
            prefix="@"
            onItemClick={onMentionItemClick}
          />
        ) : null}
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            width: '100%',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: theme.surface,
          }}
        >
          {modeConfig.icon && (
            <box
              style={{
                flexShrink: 0,
                paddingRight: 1,
              }}
            >
              <text style={{ fg: theme[modeConfig.color] }}>
                {modeConfig.icon}
              </text>
            </box>
          )}
          <MultilineInput
            value={inputValue}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            onPaste={onPaste}
            onKeyIntercept={handleKeyIntercept}
            placeholder={effectivePlaceholder}
            focused={inputFocused && !feedbackMode}
            maxHeight={compactMaxHeight}
            ref={inputRef}
            cursorPosition={cursorPosition}
          />
        </box>
        <InputModeBanner />
      </>
    )
  }

  return (
    <>
      <box
        title={inputBoxTitle}
        titleAlignment="center"
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          flexDirection: 'column',
          gap: hasAnyPreview ? 1 : 0,
        }}
      >
        {hasSlashSuggestions ? (
          <SuggestionMenu
            items={slashSuggestionItems}
            selectedIndex={slashSelectedIndex}
            maxVisible={10}
            prefix="/"
            onItemClick={onSlashItemClick}
          />
        ) : null}
        {hasMentionSuggestions ? (
          <SuggestionMenu
            items={[...agentSuggestionItems, ...fileSuggestionItems]}
            selectedIndex={agentSelectedIndex}
            maxVisible={10}
            prefix="@"
            onItemClick={onMentionItemClick}
          />
        ) : null}
        <box
          style={{
            flexDirection: 'column',
            justifyContent: shouldCenterInputVertically
              ? 'center'
              : 'flex-start',
            minHeight: shouldCenterInputVertically ? 3 : undefined,
            gap: 0,
          }}
        >
          <box
            style={{
              flexDirection: 'row',
              alignItems: shouldCenterInputVertically ? 'center' : 'flex-start',
              width: '100%',
            }}
          >
            {modeConfig.icon && (
              <box
                style={{
                  flexShrink: 0,
                  paddingRight: 1,
                }}
              >
                <text style={{ fg: theme[modeConfig.color] }}>
                  {modeConfig.icon}
                </text>
              </box>
            )}
            <box style={{ flexGrow: 1, minWidth: 0 }}>
              <MultilineInput
                value={inputValue}
                onChange={handleInputChange}
                onSubmit={handleSubmit}
                onPaste={onPaste}
                onKeyIntercept={handleKeyIntercept}
                placeholder={effectivePlaceholder}
                focused={inputFocused && !feedbackMode}
                maxHeight={Math.floor(terminalHeight / 2)}
                ref={inputRef}
                cursorPosition={cursorPosition}
              />
            </box>
            {modeConfig.showAgentModeToggle && !isNarrowWidth && (
              <box
                style={{
                  flexShrink: 0,
                  paddingLeft: 2,
                }}
              >
                <AgentModeToggle
                  mode={agentMode}
                  onToggle={toggleAgentMode}
                  onSelectMode={setAgentMode}
                />
              </box>
            )}
          </box>
        </box>
      </box>
      <InputModeBanner />
    </>
  )
}
