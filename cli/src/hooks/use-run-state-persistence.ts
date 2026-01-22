/**
 * Hook for managing run state persistence.
 * Handles loading previous chat state on continue and saving state after runs.
 */

import { useEffect, useRef } from 'react'

import { setCurrentChatId } from '../project-files'
import {
  loadMostRecentChatState,
  saveChatState,
} from '../utils/run-state-storage'

import type { ChatMessage } from '../types/chat'
import type { RunState } from '@codebuff/sdk'

export interface UseRunStatePersistenceOptions {
  /** Whether to continue from a previous chat */
  continueChat: boolean
  /** Optional specific chat ID to continue from */
  continueChatId?: string
  /** Setter for messages state */
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  /** Setter for run state */
  setRunState: (state: RunState | null) => void
}

export interface UseRunStatePersistenceReturn {
  /** Ref to the previous run state for continuation */
  previousRunStateRef: React.MutableRefObject<RunState | null>
  /** Clear the run state */
  resetRunState: () => void
  /** Persist run state and messages to storage */
  persistState: (runState: RunState, messages: ChatMessage[]) => void
  /** Update the run state ref and store */
  updateRunState: (runState: RunState) => void
}

/**
 * Hook for managing run state persistence.
 * Extracts the run state loading/saving logic from useSendMessage.
 */
export function useRunStatePersistence({
  continueChat,
  continueChatId,
  setMessages,
  setRunState,
}: UseRunStatePersistenceOptions): UseRunStatePersistenceReturn {
  const previousRunStateRef = useRef<RunState | null>(null)

  // Load previous chat state on mount if continuing
  useEffect(() => {
    if (continueChat && !previousRunStateRef.current) {
      const loadedState = loadMostRecentChatState(continueChatId ?? undefined)
      if (loadedState) {
        previousRunStateRef.current = loadedState.runState
        setRunState(loadedState.runState)
        setMessages(loadedState.messages)
        if (loadedState.chatId) {
          setCurrentChatId(loadedState.chatId)
        }
      }
    }
  }, [continueChat, continueChatId, setMessages, setRunState])

  function resetRunState() {
    previousRunStateRef.current = null
  }

  function persistState(runState: RunState, messages: ChatMessage[]) {
    saveChatState(runState, messages)
  }

  function updateRunState(runState: RunState) {
    previousRunStateRef.current = runState
    setRunState(runState)
  }

  return {
    previousRunStateRef,
    resetRunState,
    persistState,
    updateRunState,
  }
}
