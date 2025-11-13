import { getSystemMessage } from './message-history'

import type { User } from './auth'
import type { AgentMode } from './constants'
import type { MultilineInputHandle } from '../components/multiline-input'
import type { ChatMessage } from '../types/chat'
import type { UseMutationResult } from '@tanstack/react-query'

export function handleSlashCommands(params: {
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentMode: AgentMode
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  inputValue: string
  isChainInProgressRef: React.MutableRefObject<boolean>
  isStreaming: boolean
  logoutMutation: UseMutationResult<boolean, Error, void, unknown>
  streamMessageIdRef: React.MutableRefObject<string | null>
  addToQueue: (message: string) => void
  handleCtrlC: () => true
  saveToHistory: (message: string) => void
  scrollToLatest: () => void
  sendMessage: (
    content: string,
    params: { agentMode: AgentMode },
  ) => Promise<void>
  setCanProcessQueue: (value: React.SetStateAction<boolean>) => void
  setInputFocused: (focused: boolean) => void
  setInputValue: (value: string | ((prev: string) => string)) => void
  setIsAuthenticated: (value: React.SetStateAction<boolean | null>) => void
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  setUser: (value: React.SetStateAction<User | null>) => void
  stopStreaming: () => void
}) {
  const {
    abortControllerRef,
    agentMode,
    inputRef,
    inputValue,
    isChainInProgressRef,
    isStreaming,
    logoutMutation,
    streamMessageIdRef,
    addToQueue,
    handleCtrlC,
    saveToHistory,
    scrollToLatest,
    sendMessage,
    setCanProcessQueue,
    setInputFocused,
    setInputValue,
    setIsAuthenticated,
    setMessages,
    setUser,
    stopStreaming,
  } = params

  const trimmed = inputValue.trim()
  if (!trimmed) return

  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  const cmd = normalized.split(/\s+/)[0].toLowerCase()
  if (cmd === 'login' || cmd === 'signin') {
    setMessages((prev) => [
      ...prev,
      getSystemMessage(
        "You're already in the app. Use /logout to switch accounts.",
      ),
    ])
    setInputValue('')
    return
  }
  if (cmd === 'logout' || cmd === 'signout') {
    abortControllerRef.current?.abort()
    stopStreaming()
    setCanProcessQueue(false)

    logoutMutation.mutate(undefined, {
      onSettled: () => {
        const msg = {
          id: `sys-${Date.now()}`,
          variant: 'ai' as const,
          content: 'Logged out.',
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, msg])
        setInputValue('')
        setTimeout(() => {
          setUser(null)
          setIsAuthenticated(false)
        }, 300)
      },
    })
    return
  }

  if (cmd === 'exit' || cmd === 'quit') {
    abortControllerRef.current?.abort()
    stopStreaming()
    setCanProcessQueue(false)
    setInputValue('')
    handleCtrlC()
    return
  }

  if (cmd === 'init') {
    // do not return, continue on to send to agent-runtime
  }

  saveToHistory(trimmed)
  setInputValue('')

  if (
    isStreaming ||
    streamMessageIdRef.current ||
    isChainInProgressRef.current
  ) {
    addToQueue(trimmed)
    setInputFocused(true)
    inputRef.current?.focus()
    return
  }

  sendMessage(trimmed, { agentMode })

  setTimeout(() => {
    scrollToLatest()
  }, 0)
}
