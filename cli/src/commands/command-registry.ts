import { handleInitializationFlowLocally } from './init'
import { handleUsageCommand } from './usage'
import { useChatStore } from '../state/chat-store'
import { useLoginStore } from '../state/login-store'
import { getSystemMessage } from '../utils/message-history'

import type { ChatMessage } from '../types/chat'
import type { MultilineInputHandle } from '../components/multiline-input'
import type { InputValue } from '../state/chat-store'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { User } from '../utils/auth'
import type { AgentMode } from '../utils/constants'
import type { UseMutationResult } from '@tanstack/react-query'

export type RouterParams = {
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
}

export type CommandResult = { openFeedbackMode?: boolean } | void

export type CommandHandler = (
  params: RouterParams,
  args: string,
) => Promise<CommandResult> | CommandResult

export type CommandDefinition = {
  name: string
  aliases: string[]
  handler: CommandHandler
}

const clearInput = (params: RouterParams) => {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

export const COMMAND_REGISTRY: CommandDefinition[] = [
  {
    name: 'feedback',
    aliases: ['bug', 'report'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openFeedbackMode: true }
    },
  },
  {
    name: 'bash',
    aliases: ['!'],
    handler: (params) => {
      useChatStore.getState().setBashMode(true)
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  },
  {
    name: 'login',
    aliases: ['signin'],
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getSystemMessage(
          "You're already in the app. Use /logout to switch accounts.",
        ),
      ])
      clearInput(params)
    },
  },
  {
    name: 'logout',
    aliases: ['signout'],
    handler: (params) => {
      params.abortControllerRef.current?.abort()
      params.stopStreaming()
      params.setCanProcessQueue(false)

      const { resetLoginState } = useLoginStore.getState()
      params.logoutMutation.mutate(undefined, {
        onSettled: () => {
          resetLoginState()
          params.setMessages((prev) => [...prev, getSystemMessage('Logged out.')])
          clearInput(params)
          setTimeout(() => {
            params.setUser(null)
            params.setIsAuthenticated(false)
          }, 300)
        },
      })
    },
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    handler: () => {
      process.kill(process.pid, 'SIGINT')
    },
  },
  {
    name: 'new',
    aliases: ['n', 'clear', 'c'],
    handler: (params) => {
      params.setMessages(() => [])
      params.clearMessages()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      params.stopStreaming()
      params.setCanProcessQueue(false)
    },
  },
  {
    name: 'init',
    aliases: [],
    handler: async (params, args) => {
      const { postUserMessage } = handleInitializationFlowLocally()
      const trimmed = params.inputValue.trim()
      
      params.saveToHistory(trimmed)
      clearInput(params)

      // Check streaming/queue state
      if (
        params.isStreaming ||
        params.streamMessageIdRef.current ||
        params.isChainInProgressRef.current
      ) {
        params.addToQueue(trimmed)
        params.setInputFocused(true)
        params.inputRef.current?.focus()
        return
      }

      params.sendMessage({ content: trimmed, agentMode: params.agentMode, postUserMessage })
      setTimeout(() => {
        params.scrollToLatest()
      }, 0)
    },
  },
  {
    name: 'usage',
    aliases: ['credits'],
    handler: async (params) => {
      const { postUserMessage } = await handleUsageCommand()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  },
]

export function findCommand(cmd: string): CommandDefinition | undefined {
  const lowerCmd = cmd.toLowerCase()
  return COMMAND_REGISTRY.find(
    (def) => def.name === lowerCmd || def.aliases.includes(lowerCmd),
  )
}
