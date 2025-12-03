import { handleImageCommand } from './image'
import { handleInitializationFlowLocally } from './init'
import { handleReferralCode } from './referral'
import { runBashCommand } from './router'
import { normalizeReferralCode } from './router-utils'
import { handleUsageCommand } from './usage'
import { useChatStore } from '../state/chat-store'
import { useLoginStore } from '../state/login-store'
import { capturePendingImages } from '../utils/add-pending-image'
import { getSystemMessage, getUserMessage } from '../utils/message-history'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { InputValue, PendingImage } from '../state/chat-store'
import type { ChatMessage } from '../types/chat'
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
  addToQueue: (message: string, images?: PendingImage[]) => void
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
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided a command directly, execute it immediately
      if (trimmedArgs) {
        const commandWithBang = '!' + trimmedArgs
        params.saveToHistory(commandWithBang)
        clearInput(params)
        runBashCommand(trimmedArgs)
        return
      }

      // Otherwise enter bash mode
      useChatStore.getState().setInputMode('bash')
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  },
  {
    name: 'referral',
    aliases: ['redeem'],
    handler: async (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided a code directly, redeem it immediately
      if (trimmedArgs) {
        const code = normalizeReferralCode(trimmedArgs)
        try {
          const { postUserMessage } = await handleReferralCode(code)
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            ...postUserMessage([]),
          ])
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Error redeeming referral code: ${errorMessage}`),
          ])
        }
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      // Otherwise enter referral mode
      useChatStore.getState().setInputMode('referral')
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
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage('Logged out.'),
          ])
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
    handler: async (params) => {
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
        const pendingImages = capturePendingImages()
        params.addToQueue(trimmed, pendingImages)
        params.setInputFocused(true)
        params.inputRef.current?.focus()
        return
      }

      params.sendMessage({
        content: trimmed,
        agentMode: params.agentMode,
        postUserMessage,
      })
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
  {
    name: 'image',
    aliases: ['img', 'attach'],
    handler: async (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided a path directly, process it immediately
      if (trimmedArgs) {
        await handleImageCommand(trimmedArgs)
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      // Otherwise enter image mode
      useChatStore.getState().setInputMode('image')
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
