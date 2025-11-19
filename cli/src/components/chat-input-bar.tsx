import React from 'react'
import { AgentModeToggle } from './agent-mode-toggle'
import { FeedbackContainer } from './feedback-container'
import { MultilineInput, type MultilineInputHandle } from './multiline-input'
import { SuggestionMenu, type SuggestionItem } from './suggestion-menu'
import { UsageBanner } from './usage-banner'
import { BORDER_CHARS } from '../utils/ui-constants'
import { useTheme } from '../hooks/use-theme'
import type { AgentMode } from '../utils/constants'
import type { InputValue } from '../state/chat-store'

type Theme = ReturnType<typeof useTheme>

interface ChatInputBarProps {
  // Input state
  inputValue: string
  cursorPosition: number
  setInputValue: (value: InputValue | ((prev: InputValue) => InputValue)) => void
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
  handleExitFeedback: () => void
  
  // Handlers
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
  if (feedbackMode) {
    return (
      <FeedbackContainer
        inputRef={inputRef}
        onExitFeedback={handleExitFeedback}
        width={separatorWidth}
      />
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
          borderColor: theme.foreground,
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
              alignItems: shouldCenterInputVertically
                ? 'center'
                : 'flex-start',
              width: '100%',
            }}
          >
            <box style={{ flexGrow: 1, minWidth: 0 }}>
              <MultilineInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                placeholder={inputPlaceholder}
                focused={inputFocused && !feedbackMode}
                maxHeight={Math.floor(terminalHeight / 2)}
                width={inputWidth}
                onKeyIntercept={handleSuggestionMenuKey}
                textAttributes={theme.messageTextAttributes}
                ref={inputRef}
                cursorPosition={cursorPosition}
              />
            </box>
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
          </box>
        </box>
      </box>
      <UsageBanner />
    </>
  )
}
