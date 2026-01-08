import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { getAllChatsMetadata } from '../commands/chats'
import { useSearchableList } from '../hooks/use-searchable-list'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'

import type { ChatMetadata } from '../commands/chats'
import type { SelectableListItem } from './selectable-list'
import type { KeyEvent } from '@opentui/core'

// Layout constants
const LAYOUT = {
  MAX_CONTENT_WIDTH: 100,
  CONTENT_PADDING: 4,
  HEADER_HEIGHT: 3,
  INPUT_HEIGHT: 3,
  FOOTER_HEIGHT: 2,
  MIN_LIST_HEIGHT: 3,
  COMPACT_MODE_THRESHOLD: 15,
} as const

interface ChatPickerScreenProps {
  /** Called when user selects a chat to resume */
  onSelectChat: (chatId: string) => void
  /** Called when user closes the picker */
  onClose: () => void
}

export const ChatPickerScreen: React.FC<ChatPickerScreenProps> = ({
  onSelectChat,
  onClose,
}) => {
  const theme = useTheme()
  const [chats, setChats] = useState<ChatMetadata[]>([])
  const [loading, setLoading] = useState(true)

  // Load chats on mount
  useEffect(() => {
    const metadata = getAllChatsMetadata()
    setChats(metadata)
    setLoading(false)
  }, [])

  // Convert chats to SelectableListItem format
  const chatItems: SelectableListItem[] = useMemo(
    () =>
      chats.map((chat) => ({
        id: chat.chatId,
        label: chat.title,
        icon: '💬',
        secondary: `${chat.lastPrompt ? chat.lastPrompt + ' • ' : ''}${chat.formattedDate} • ${chat.messageCount} message${chat.messageCount === 1 ? '' : 's'}`,
      })),
    [chats],
  )

  // Search filtering and focus management
  const {
    searchQuery,
    setSearchQuery,
    focusedIndex,
    setFocusedIndex,
    filteredItems,
    handleFocusChange,
  } = useSearchableList({
    items: chatItems,
  })

  // Layout calculations
  const { terminalWidth, terminalHeight } = useTerminalLayout()
  const contentWidth = Math.min(
    terminalWidth - LAYOUT.CONTENT_PADDING,
    LAYOUT.MAX_CONTENT_WIDTH,
  )

  const isCompactMode = terminalHeight < LAYOUT.COMPACT_MODE_THRESHOLD
  const mainPadding = isCompactMode ? 0 : 1

  // Calculate list height
  const essentialHeight =
    LAYOUT.HEADER_HEIGHT +
    LAYOUT.INPUT_HEIGHT +
    LAYOUT.FOOTER_HEIGHT +
    mainPadding * 2
  const availableForList = Math.max(
    LAYOUT.MIN_LIST_HEIGHT,
    terminalHeight - essentialHeight,
  )

  // Handle selection
  const handleChatSelect = useCallback(
    (item: SelectableListItem) => {
      onSelectChat(item.id)
    },
    [onSelectChat],
  )

  // Keyboard handling
  const handleKeyIntercept = useCallback(
    (key: KeyEvent): boolean => {
      if (key.name === 'escape') {
        if (searchQuery.length > 0) {
          setSearchQuery('')
          return true
        }
        onClose()
        return true
      }
      if (key.name === 'up') {
        setFocusedIndex((prev) => Math.max(0, prev - 1))
        return true
      }
      if (key.name === 'down') {
        setFocusedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1))
        return true
      }
      if (key.name === 'return' || key.name === 'enter') {
        if (filteredItems[focusedIndex]) {
          handleChatSelect(filteredItems[focusedIndex])
        }
        return true
      }
      // Ctrl+C to quit
      if (key.name === 'c' && key.ctrl) {
        process.exit(0)
        return true
      }
      return false
    },
    [
      searchQuery,
      setSearchQuery,
      onClose,
      setFocusedIndex,
      filteredItems,
      focusedIndex,
      handleChatSelect,
    ],
  )

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        padding: 0,
        flexDirection: 'column',
      }}
    >
      {/* Main content area */}
      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          padding: mainPadding,
          width: contentWidth,
          alignSelf: 'center',
        }}
      >
        {/* Header */}
        {!isCompactMode && (
          <box style={{ marginBottom: 1 }}>
            <text style={{ fg: theme.primary }}>
              Browse your chat history
            </text>
          </box>
        )}

        {/* Search input */}
        <box style={{ marginBottom: 1 }}>
          <MultilineInput
            value={searchQuery}
            onChange={({ text }) => setSearchQuery(text)}
            onSubmit={() => {}} // Enter key handled by onKeyIntercept
            onPaste={() => {}} // Paste not needed
            onKeyIntercept={handleKeyIntercept}
            placeholder="Search chats..."
            focused={true}
            maxHeight={1}
            minHeight={1}
            cursorPosition={searchQuery.length}
          />
        </box>

        {/* Chat list or empty state */}
        <box style={{ flexGrow: 1 }}>
          {loading ? (
            <box style={{ padding: 1 }}>
              <text style={{ fg: theme.muted }}>
                Loading chats...
              </text>
            </box>
          ) : filteredItems.length === 0 ? (
            <box style={{ padding: 1, flexDirection: 'column' }}>
              <text style={{ fg: theme.muted }}>
                {searchQuery
                  ? 'No matching chats found'
                  : 'No chat history. Start a conversation to create your first chat!'}
              </text>
              {!searchQuery && (
                <text style={{ fg: theme.muted, marginTop: 1 }}>
                  Press Esc to close
                </text>
              )}
            </box>
          ) : (
            <SelectableList
              items={filteredItems}
              focusedIndex={focusedIndex}
              onSelect={handleChatSelect}
              onFocusChange={handleFocusChange}
              maxHeight={availableForList}
            />
          )}
        </box>

        {/* Footer help text */}
        {!isCompactMode && filteredItems.length > 0 && (
          <box style={{ marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>
              ↑↓ Navigate • Enter Select • Esc {searchQuery ? 'Clear' : 'Close'}
            </text>
          </box>
        )}
      </box>
    </box>
  )
}
