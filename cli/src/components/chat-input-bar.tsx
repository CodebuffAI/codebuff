import React from 'react'

import { AgentModeToggle } from './agent-mode-toggle'
import { FeedbackContainer } from './feedback-container'
import { MultipleChoiceForm } from './ask-user'
import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { ReferralBanner } from './referral-banner'
import { SuggestionMenu, type SuggestionItem } from './suggestion-menu'
import { UsageBanner } from './usage-banner'
import { useChatStore } from '../state/chat-store'
import { useAskUserBridge } from '../hooks/use-ask-user-bridge'

import { getInputModeConfig } from '../utils/input-modes'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { useTheme } from '../hooks/use-theme'
import type { InputValue } from '../state/chat-store'
import type { AgentMode } from '../utils/constants'
import type { InputMode } from '../utils/input-modes'

type Theme = ReturnType<typeof useTheme>

const InputModeBanner = ({
  inputMode,
  usageBannerShowTime,
}: {
  inputMode: InputMode
  usageBannerShowTime: number
}) => {
  switch (inputMode) {
    case 'usage':
      return <UsageBanner showTime={usageBannerShowTime} />
    case 'referral':
      return <ReferralBanner />
    default:
      return null
  }
}

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
  inputWidth: number
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

  // Layout
  theme: Theme
  terminalHeight: number
  separatorWidth: number
  shouldCenterInputVertically: boolean
  inputBoxTitle: string | undefined

  // Feedback mode
  feedbackMode: boolean
  handleExitFeedback: () => void // Handlers
  handleSubmit: () => Promise<void>
}

export const ChatInputBar = ({
  inputValue,
  cursorPosition,
  setInputValue,
  inputFocused,
  inputRef,
  inputPlaceholder,
  inputWidth,
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
  theme,
  terminalHeight,
  separatorWidth,
  shouldCenterInputVertically,
  inputBoxTitle,
  feedbackMode,
  handleExitFeedback,
  handleSubmit,
}: ChatInputBarProps) => {
  const inputMode = useChatStore((state) => state.inputMode)
  const setInputMode = useChatStore((state) => state.setInputMode)

  const [usageBannerShowTime, setUsageBannerShowTime] = React.useState(
    () => Date.now(),
  )

  React.useEffect(() => {
    if (inputMode === 'usage') {
      setUsageBannerShowTime(Date.now())
    }
  }, [inputMode])

  const modeConfig = getInputModeConfig(inputMode)
  const askUserState = useChatStore((state) => state.askUserState)
  const updateAskUserAnswer = useChatStore((state) => state.updateAskUserAnswer)
  const updateAskUserOtherText = useChatStore(
    (state) => state.updateAskUserOtherText,
  )
  const { submitAnswers } = useAskUserBridge()
  const [askUserTitle, setAskUserTitle] = React.useState(' Action Required ')

  if (feedbackMode) {
    return (
      <FeedbackContainer
        inputRef={inputRef}
        onExitFeedback={handleExitFeedback}
        width={separatorWidth}
      />
    )
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
    finalAnswers?: (number | number[])[],
    finalOtherTexts?: string[],
  ) => {
    if (!askUserState) return

    // Use final values if provided (for immediate submission), otherwise use current state
    const answersToUse = finalAnswers || askUserState.selectedAnswers
    const otherTextsToUse = finalOtherTexts || askUserState.otherTexts

    const answers = askUserState.questions.map((q, idx) => {
      const otherText = otherTextsToUse[idx]?.trim()
      if (otherText) {
        // User provided custom text
        return {
          questionIndex: idx,
          otherText,
        }
      }

      const answer = answersToUse[idx]

      // Helper to get option label (handles both string and object formats)
      const getOptionLabel = (optionIndex: number) => {
        const opt = q.options[optionIndex]
        return typeof opt === 'string' ? opt : opt.label
      }

      if (Array.isArray(answer)) {
        // Multi-select: map array of indices to array of option labels
        // Empty array means skipped
        return {
          questionIndex: idx,
          selectedOptions:
            answer.length > 0 ? answer.map(getOptionLabel) : undefined,
        }
      } else if (
        typeof answer === 'number' &&
        answer >= 0 &&
        answer < q.options.length
      ) {
        // Single-select with valid answer
        return {
          questionIndex: idx,
          selectedOption: getOptionLabel(answer),
        }
      } else {
        // Skipped (answer is -1 or invalid)
        return {
          questionIndex: idx,
        }
      }
    })
    submitAnswers(answers)
  }

  // Adjust input width based on mode configuration
  const adjustedInputWidth = inputWidth - modeConfig.widthAdjustment
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
          selectedAnswers={askUserState.selectedAnswers}
          otherTexts={askUserState.otherTexts}
          onSelectAnswer={updateAskUserAnswer}
          onOtherTextChange={updateAskUserOtherText}
          onSubmit={handleFormSubmit}
          onQuestionChange={(
            currentIndex,
            totalQuestions,
            isOnConfirmScreen,
          ) => {
            if (isOnConfirmScreen) {
              setAskUserTitle(' Ready to submit ')
            } else {
              setAskUserTitle(
                ` Question ${currentIndex + 1} of ${totalQuestions} `,
              )
            }
          }}
          width={inputWidth}
        />
      </box>
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
          gap: hasSuggestionMenu ? 1 : 0,
        }}
      >
        {hasSlashSuggestions ? (
          <SuggestionMenu
            items={slashSuggestionItems}
            selectedIndex={slashSelectedIndex}
            maxVisible={10}
            prefix="/"
          />
        ) : null}
        {hasMentionSuggestions ? (
          <SuggestionMenu
            items={[...agentSuggestionItems, ...fileSuggestionItems]}
            selectedIndex={agentSelectedIndex}
            maxVisible={10}
            prefix="@"
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
                onKeyIntercept={(key) => {
                  // Intercept navigation keys when suggestion menu is active
                  // The useChatKeyboard hook will handle menu selection/navigation
                  const hasSuggestions = hasSlashSuggestions || hasMentionSuggestions
                  if (!hasSuggestions) return false

                  const isPlainEnter =
                    (key.name === 'return' || key.name === 'enter') &&
                    !key.shift &&
                    !key.ctrl &&
                    !key.meta &&
                    !key.option
                  const isTab =
                    key.name === 'tab' && !key.ctrl && !key.meta && !key.option
                  const isUpDown =
                    (key.name === 'up' || key.name === 'down') &&
                    !key.ctrl &&
                    !key.meta &&
                    !key.option

                  // Don't intercept Up/Down when user is navigating history
                  // (lastEditDueToNav is true), let them continue paging through
                  if (isUpDown && lastEditDueToNav) {
                    return false
                  }

                  if (isPlainEnter || isTab || isUpDown) {
                    return true // Prevent default, let useChatKeyboard handle it
                  }
                  return false
                }}
                placeholder={effectivePlaceholder}
                focused={inputFocused && !feedbackMode}
                maxHeight={Math.floor(terminalHeight / 2)}
                width={adjustedInputWidth}
                textAttributes={theme.messageTextAttributes}
                ref={inputRef}
                cursorPosition={cursorPosition}
              />
            </box>
            {modeConfig.showAgentModeToggle && (
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
      <InputModeBanner
        inputMode={inputMode}
        usageBannerShowTime={usageBannerShowTime}
      />
    </>
  )
}
