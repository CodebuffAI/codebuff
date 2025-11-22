import React from 'react'
import { AgentModeToggle } from './agent-mode-toggle'
import { FeedbackContainer } from './feedback-container'
import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { SuggestionMenu, type SuggestionItem } from './suggestion-menu'
import { UsageBanner } from './usage-banner'
import { BORDER_CHARS } from '../utils/ui-constants'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import type { AgentMode } from '../utils/constants'
import type { InputValue } from '../state/chat-store'

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
  inputWidth: number

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
  handleSuggestionMenuKey: (key: any) => boolean

  // Layout
  theme: Theme
  terminalHeight: number
  separatorWidth: number
  shouldCenterInputVertically: boolean
  inputBoxTitle: string | undefined

  // Feedback mode
  feedbackMode: boolean
  handleExitFeedback: () => void  // Handlers
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
  handleSuggestionMenuKey,
  theme,
  terminalHeight,
  separatorWidth,
  shouldCenterInputVertically,
  inputBoxTitle,
  feedbackMode,
  handleExitFeedback,
  handleSubmit,
}: ChatInputBarProps) => {
  const isBashMode = useChatStore((state) => state.isBashMode)
  const setBashMode = useChatStore((state) => state.setBashMode)
  if (feedbackMode) {
    return (
      <FeedbackContainer
        inputRef={inputRef}
        onExitFeedback={handleExitFeedback}
        width={separatorWidth}
      />
    )
  }

  // Handle input changes with bash mode logic
  const handleInputChange = (value: InputValue) => {
    // Detect entering bash mode: user typed '!' at the start when not already in bash mode
    const userTypedBang = !isBashMode && value.text.startsWith('!')

    if (userTypedBang) {
      // Enter bash mode: remove the '!' prefix and preserve the rest of the text
      const textAfterBang = value.text.slice(1)
      setBashMode(true)
      setInputValue({
        text: textAfterBang,
        cursorPosition: Math.max(0, value.cursorPosition - 1),
        lastEditDueToNav: value.lastEditDueToNav,
      })
      return
    }

    // Normal input handling
    setInputValue(value)
  }

  // Adjust input width for bash mode (subtract 2 for '!' column)
  const adjustedInputWidth = isBashMode ? inputWidth - 2 : inputWidth
  const effectivePlaceholder = isBashMode
    ? 'Enter bash command...'
    : inputPlaceholder

  return (
    <>
      <box
        title={inputBoxTitle}
        titleAlignment="center"
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor: isBashMode ? theme.error : theme.foreground,
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
            {isBashMode && (
              <box
                style={{
                  flexShrink: 0,
                  paddingRight: 1,
                }}
              >
                <text style={{ fg: theme.error }}>!</text>
              </box>
            )}
            <box style={{ flexGrow: 1, minWidth: 0 }}>
              <MultilineInput
                value={inputValue}
                onChange={handleInputChange}
                onSubmit={handleSubmit}
                placeholder={effectivePlaceholder}
                focused={inputFocused && !feedbackMode}
                maxHeight={Math.floor(terminalHeight / 2)}
                width={adjustedInputWidth}
                onKeyIntercept={handleSuggestionMenuKey}
                textAttributes={theme.messageTextAttributes}
                ref={inputRef}
                cursorPosition={cursorPosition}
              />
            </box>
            {!isBashMode && (
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
      <UsageBanner />
    </>
  )
}
