import { runTerminalCommand } from '@codebuff/sdk'

import { handleInitializationFlowLocally } from './init'
import { handleUsageCommand } from './usage'
import { getSystemMessage, getUserMessage } from '../utils/message-history'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { InputValue } from '../state/chat-store'
import type { ChatMessage, ContentBlock } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { User } from '../utils/auth'
import type { AgentMode } from '../utils/constants'
import type { UseMutationResult } from '@tanstack/react-query'

export async function routeUserPrompt(params: {
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentMode: AgentMode
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  inputValue: string
  isChainInProgressRef: React.MutableRefObject<boolean>
  isStreaming: boolean
  logoutMutation: UseMutationResult<boolean, Error, void, unknown>
  streamMessageIdRef: React.MutableRefObject<string | null>
  addToQueue: (message: string) => void
  clearMessages: () => void
  clearQueue: () => string[]
  handleCtrlC: () => true
  saveToHistory: (message: string) => void
  scrollToLatest: () => void
  sendMessage: SendMessageFn
  setCanProcessQueue: (value: React.SetStateAction<boolean>) => void
  setInputFocused: (focused: boolean) => void
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
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
    clearMessages,
    clearQueue,
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

  let postUserMessage: Parameters<SendMessageFn>[0]['postUserMessage'] =
    undefined

  if (trimmed.startsWith('!')) {
    const toolCallId = crypto.randomUUID()
    const resultBlock: ContentBlock = {
      type: 'tool',
      toolName: 'run_terminal_command',
      toolCallId,
      input: { command: trimmed.slice(1).trim() },
      output: '',
    }

    setMessages((prev) => [
      ...prev,
      getUserMessage(trimmed),
      getSystemMessage([resultBlock]),
    ])

    runTerminalCommand({
      command: trimmed.slice(1).trim(),
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: -1,
      env: process.env,
    }).then(([{ value }]) => {
      setMessages((prev) => {
        const output = 'stdout' in value ? value.stdout : ''
        return prev.map((msg) => {
          if (!msg.blocks) {
            return msg
          }
          return {
            ...msg,
            blocks: msg.blocks.map((block) =>
              'toolCallId' in block && block.toolCallId === toolCallId
                ? {
                    ...block,
                    output,
                  }
                : block,
            ),
          }
        })
      })
    })

    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

    return
  }

  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  const cmd = normalized.split(/\s+/)[0].toLowerCase()
  if (cmd === 'login' || cmd === 'signin') {
    setMessages((prev) => [
      ...prev,
      getSystemMessage(
        "You're already in the app. Use /logout to switch accounts.",
      ),
    ])
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    return
  }
  if (cmd === 'logout' || cmd === 'signout') {
    abortControllerRef.current?.abort()
    stopStreaming()
    setCanProcessQueue(false)

    logoutMutation.mutate(undefined, {
      onSettled: () => {
        setMessages((prev) => [...prev, getSystemMessage('Logged out.')])
        setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
        setTimeout(() => {
          setUser(null)
          setIsAuthenticated(false)
        }, 300)
      },
    })
    return
  }

  if (cmd === 'exit' || cmd === 'quit') {
    process.kill(process.pid, 'SIGINT')
    return
  }

  if (cmd === 'clear' || cmd === 'new') {
    setMessages(() => [])
    clearMessages()

    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

    stopStreaming()
    setCanProcessQueue(false)
    return
  }

  if (cmd === 'init') {
    ;({ postUserMessage } = handleInitializationFlowLocally())
    // do not return, continue and send to agent runtime
  }

  if (cmd === 'usage' || cmd === 'credits') {
    const { postUserMessage: usagePostMessage } = await handleUsageCommand()
    setMessages((prev) => usagePostMessage(prev))
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    return
  }

  saveToHistory(trimmed)
  setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

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

  sendMessage({ content: trimmed, agentMode, postUserMessage })

  setTimeout(() => {
    scrollToLatest()
  }, 0)
}
