import React from 'react'

import { SuggestionMenu } from './suggestion-menu'
import { AgentModeToggle } from './agent-mode-toggle'
import { MultilineInput } from './multiline-input'
import { BORDER_CHARS } from '../utils/ui-constants'

interface ChatInputAreaProps {
  theme: any
  separatorWidth: number
  terminalHeight: number
  hasSuggestionMenu: boolean
  hasSlashSuggestions: boolean
  hasMentionSuggestions: boolean
  slashSuggestionItems: any[]
  agentSuggestionItems: any[]
  fileSuggestionItems: any[]
  slashSelectedIndex: number
  agentSelectedIndex: number
  inputValue: string
  setInputValue: (value: any) => void
  handleSubmit: () => Promise<void>
  inputPlaceholder: string
  inputFocused: boolean
  feedbackMode: boolean
  inputWidth: number
  handleSuggestionMenuKey: (key: any) => boolean
  cursorPosition: number
  agentMode: any
  toggleAgentMode: () => void
  setAgentMode: (mode: any) => void
  shouldCenterInputVertically: boolean
  inputBoxTitle?: string
  inputRef: React.MutableRefObject<any>
}

export const ChatInputArea = ({
  theme,
  separatorWidth,
  terminalHeight,
  hasSuggestionMenu,
  hasSlashSuggestions,
  hasMentionSuggestions,
  slashSuggestionItems,
  agentSuggestionItems,
  fileSuggestionItems,
  slashSelectedIndex,
  agentSelectedIndex,
  inputValue,
  setInputValue,
  handleSubmit,
  inputPlaceholder,
  inputFocused,
  feedbackMode,
  inputWidth,
  handleSuggestionMenuKey,
  cursorPosition,
  agentMode,
  toggleAgentMode,
  setAgentMode,
  shouldCenterInputVertically,
  inputBoxTitle,
  inputRef,
}: ChatInputAreaProps) => {
  return (
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
  )
}
