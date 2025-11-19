import React, { createContext, useContext } from 'react'

export interface MessageActions {
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onFeedback: (messageId: string) => void
  onCloseFeedback: () => void
}

const MessageActionsContext = createContext<MessageActions | null>(null)

export const MessageActionsProvider: React.FC<{
  children: React.ReactNode
  value: MessageActions
}> = ({ children, value }) => {
  return (
    <MessageActionsContext.Provider value={value}>
      {children}
    </MessageActionsContext.Provider>
  )
}

export const useMessageActions = (): MessageActions => {
  const context = useContext(MessageActionsContext)
  if (!context) {
    throw new Error(
      'useMessageActions must be used within MessageActionsProvider',
    )
  }
  return context
}
