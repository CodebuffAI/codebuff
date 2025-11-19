import React, { createContext, useContext } from 'react'
import type { ChatTheme } from '../types/theme-system'
import type { MarkdownPalette } from '../utils/markdown-renderer'

export interface ChatThemeContextValue {
  theme: ChatTheme
  markdownPalette: MarkdownPalette
  availableWidth: number
  timerStartTime: number | null
}

const ChatThemeContext = createContext<ChatThemeContextValue | null>(null)

export const ChatThemeProvider: React.FC<{
  children: React.ReactNode
  value: ChatThemeContextValue
}> = ({ children, value }) => {
  return (
    <ChatThemeContext.Provider value={value}>
      {children}
    </ChatThemeContext.Provider>
  )
}

export const useChatTheme = (): ChatThemeContextValue => {
  const context = useContext(ChatThemeContext)
  if (!context) {
    throw new Error('useChatTheme must be used within ChatThemeProvider')
  }
  return context
}
