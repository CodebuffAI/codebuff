import React, { createContext, useContext, useMemo } from 'react'

interface FeedbackUiContextValue {
  onFeedback: (messageId: string) => void
  onClose: () => void
  isFeedbackMode: boolean
  openMessageId: string | null
  submittedMessageIds: Set<string>
  categorySelections: Map<string, string>
}

const FeedbackUiContext = createContext<FeedbackUiContextValue | null>(null)

interface FeedbackUiProviderProps {
  children: React.ReactNode
  onFeedback: (messageId: string) => void
  onClose: () => void
  isFeedbackMode: boolean
  openMessageId: string | null
  submittedMessageIds: Set<string>
  categorySelections: Map<string, string>
}

export const FeedbackUiProvider: React.FC<FeedbackUiProviderProps> = ({
  children,
  onFeedback,
  onClose,
  isFeedbackMode,
  openMessageId,
  submittedMessageIds,
  categorySelections,
}) => {
  const value = useMemo(
    () => ({
      onFeedback,
      onClose,
      isFeedbackMode,
      openMessageId,
      submittedMessageIds,
      categorySelections,
    }),
    [
      onFeedback,
      onClose,
      isFeedbackMode,
      openMessageId,
      submittedMessageIds,
      categorySelections,
    ],
  )

  return (
    <FeedbackUiContext.Provider value={value}>
      {children}
    </FeedbackUiContext.Provider>
  )
}

export const useFeedbackUi = () => useContext(FeedbackUiContext)
