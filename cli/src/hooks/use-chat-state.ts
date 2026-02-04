/**
 * Extracted chat state management hook.
 * Encapsulates Zustand store subscriptions, refs, and derived state.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useChatStore } from '../state/chat-store'

import type { InputValue, PendingBashMessage } from '../types/store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { MutableRefObject } from 'react'

/**
 * Ref objects used to track state across renders.
 * These maintain values that need to be accessed in callbacks without
 * causing re-renders.
 */
export interface ChatStateRefs {
  /** Tracks number of active agent streams */
  activeAgentStreamsRef: MutableRefObject<number>
  /** Tracks whether a chain of operations is in progress */
  isChainInProgressRef: MutableRefObject<boolean>
  /** Tracks set of active subagent IDs */
  activeSubagentsRef: MutableRefObject<Set<string>>
  /** AbortController for canceling requests */
  abortControllerRef: MutableRefObject<AbortController | null>
  /** Reference to sendMessage function for use in callbacks */
  sendMessageRef: MutableRefObject<SendMessageFn | undefined>
}

/**
 * Return type for useChatState hook.
 */
export interface UseChatStateReturn {
  // Input state
  inputValue: string
  cursorPosition: number
  lastEditDueToNav: boolean
  setInputValue: (value: InputValue | ((prev: InputValue) => InputValue)) => void
  inputFocused: boolean
  setInputFocused: (focused: boolean) => void

  // Suggestion menu state
  slashSelectedIndex: number
  setSlashSelectedIndex: (value: number | ((prev: number) => number)) => void
  agentSelectedIndex: number
  setAgentSelectedIndex: (value: number | ((prev: number) => number)) => void

  // Streaming/agent state (stabilized)
  streamingAgents: Set<string>
  focusedAgentId: string | null
  setFocusedAgentId: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  activeSubagents: Set<string>
  isChainInProgress: boolean

  // Messages
  messages: ChatMessage[]
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void

  // Mode
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  toggleAgentMode: () => void

  // Retry state
  isRetrying: boolean

  // Pending bash messages
  pendingBashMessages: PendingBashMessage[]

  // Refs
  refs: ChatStateRefs
}

/**
 * Custom hook that encapsulates chat state management.
 * Extracts state selectors, refs, and derived values from the main Chat component.
 *
 * @returns Chat state values, setters, refs
 */
export function useChatState(): UseChatStateReturn {
  // Main store selector - uses useShallow to prevent unnecessary re-renders
  const {
    inputValue,
    cursorPosition,
    lastEditDueToNav,
    setInputValue,
    inputFocused,
    setInputFocused,
    slashSelectedIndex,
    setSlashSelectedIndex,
    agentSelectedIndex,
    setAgentSelectedIndex,
    streamingAgents: rawStreamingAgents,
    focusedAgentId,
    setFocusedAgentId,
    messages,
    setMessages,
    activeSubagents,
    isChainInProgress,
    agentMode,
    setAgentMode,
    toggleAgentMode,
    isRetrying,
  } = useChatStore(
    useShallow((store) => ({
      inputValue: store.inputValue,
      cursorPosition: store.cursorPosition,
      lastEditDueToNav: store.lastEditDueToNav,
      setInputValue: store.setInputValue,
      inputFocused: store.inputFocused,
      setInputFocused: store.setInputFocused,
      slashSelectedIndex: store.slashSelectedIndex,
      setSlashSelectedIndex: store.setSlashSelectedIndex,
      agentSelectedIndex: store.agentSelectedIndex,
      setAgentSelectedIndex: store.setAgentSelectedIndex,
      streamingAgents: store.streamingAgents,
      focusedAgentId: store.focusedAgentId,
      setFocusedAgentId: store.setFocusedAgentId,
      messages: store.messages,
      setMessages: store.setMessages,
      activeSubagents: store.activeSubagents,
      isChainInProgress: store.isChainInProgress,
      agentMode: store.agentMode,
      setAgentMode: store.setAgentMode,
      toggleAgentMode: store.toggleAgentMode,
      isRetrying: store.isRetrying,
    })),
  )

  // Additional selector for pending bash messages (separate for performance)
  const pendingBashMessages = useChatStore((state) => state.pendingBashMessages)

  // Stabilize streamingAgents reference - only create new Set when content changes
  const streamingAgentsKey = useMemo(
    () => Array.from(rawStreamingAgents).sort().join(','),
    [rawStreamingAgents],
  )
  const streamingAgents = useMemo(
    () => rawStreamingAgents,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streamingAgentsKey],
  )

  // Refs for tracking state across renders
  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)
  const activeSubagentsRef = useRef<Set<string>>(activeSubagents)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendMessageRef = useRef<SendMessageFn | undefined>(undefined)

  // Sync refs with state
  useEffect(() => {
    isChainInProgressRef.current = isChainInProgress
  }, [isChainInProgress])

  useEffect(() => {
    activeSubagentsRef.current = activeSubagents
  }, [activeSubagents])

  // Assemble refs object
  const refs: ChatStateRefs = {
    activeAgentStreamsRef,
    isChainInProgressRef,
    activeSubagentsRef,
    abortControllerRef,
    sendMessageRef,
  }

  return {
    // Input state
    inputValue,
    cursorPosition,
    lastEditDueToNav,
    setInputValue,
    inputFocused,
    setInputFocused,

    // Suggestion menu state
    slashSelectedIndex,
    setSlashSelectedIndex,
    agentSelectedIndex,
    setAgentSelectedIndex,

    // Streaming/agent state (stabilized)
    streamingAgents,
    focusedAgentId,
    setFocusedAgentId,
    activeSubagents,
    isChainInProgress,

    // Messages
    messages,
    setMessages,

    // Mode
    agentMode,
    setAgentMode,
    toggleAgentMode,

    // Retry state
    isRetrying,

    // Pending bash messages
    pendingBashMessages,

    // Refs
    refs,
  }
}
