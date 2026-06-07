import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import { safeOpen } from '../utils/open-url'

import { handleHelpCommand } from './help'
import { handleImageCommand } from './image'
import { handleInfoCommand } from './info'
import { handleInitializationFlowLocally } from './init'
import { buildInterviewPrompt, buildPlanPrompt, buildReviewPromptFromArgs } from './prompt-builders'
import { runBashCommand } from './router'
import { handleUsageCommand } from './usage'
import { returnToFreebuffLanding } from '../hooks/use-freebuff-session'
import { useThemeStore } from '../hooks/use-theme'
import { WEBSITE_URL } from '../components/logo-constants'
import { useChatStore } from '../state/chat-store'
import { useFeedbackStore } from '../state/feedback-store'
import { getChatGptOAuthStatus } from '../utils/chatgpt-oauth'
import {
  AGENT_MODES,
  END_SESSION_MESSAGE,
  IS_FREEBUFF,
  isLocalMode,
} from '../utils/constants'
import { getSystemMessage, getUserMessage } from '../utils/message-history'
import {
  configureOpenbuffModelFromArgs,
  formatOpenbuffModelStatus,
  formatOpenbuffProviderStatus,
  handleOpenbuffProviderCommand,
  setupOpenbuffProviderFromArgs,
} from '../utils/openbuff-provider'
import { capturePendingAttachments } from '../utils/pending-attachments'
import { getSkillByName } from '../utils/skill-registry'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { InputValue, PendingAttachment } from '../types/store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'

export type RouterParams = {
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentMode: AgentMode
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  inputValue: string
  isChainInProgressRef: React.MutableRefObject<boolean>
  isStreaming: boolean
  streamMessageIdRef: React.MutableRefObject<string | null>
  addToQueue: (message: string, attachments?: PendingAttachment[]) => void
  clearMessages: () => void
  saveToHistory: (message: string) => void
  scrollToLatest: () => void
  sendMessage: SendMessageFn
  setCanProcessQueue: (value: React.SetStateAction<boolean>) => void
  setInputFocused: (focused: boolean) => void
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  stopStreaming: () => void
}

export type CommandResult = {
  openFeedbackMode?: boolean
  openPublishMode?: boolean
  openChatHistory?: boolean
  openReviewScreen?: boolean
  openModelRoutePicker?: boolean
  openProviderPicker?: boolean
  preSelectAgents?: string[]
} | void

export type CommandHandler = (
  params: RouterParams,
  args: string,
) => Promise<CommandResult> | CommandResult

export type CommandDefinition = {
  name: string
  aliases: string[]
  handler: CommandHandler
  /** Whether this command accepts arguments. Set automatically by the factory functions. */
  acceptsArgs: boolean
}

/**
 * Handler type for commands that don't accept arguments.
 */
type CommandHandlerNoArgs = (
  params: RouterParams,
) => Promise<CommandResult> | CommandResult

/**
 * Handler type for commands that accept arguments.
 */
type CommandHandlerWithArgs = (
  params: RouterParams,
  args: string,
) => Promise<CommandResult> | CommandResult

/**
 * Configuration for defining a command that does NOT accept arguments.
 */
type CommandConfig = {
  name: string
  aliases?: string[]
  handler: CommandHandlerNoArgs
}

/**
 * Configuration for defining a command that accepts arguments.
 */
type CommandWithArgsConfig = {
  name: string
  aliases?: string[]
  handler: CommandHandlerWithArgs
}

/**
 * Factory for commands that do NOT accept arguments.
 * Any args passed are gracefully ignored.
 */
export function defineCommand(config: CommandConfig): CommandDefinition {
  return {
    name: config.name,
    aliases: config.aliases ?? [],
    acceptsArgs: false,
    handler: (params) => {
      // Args are gracefully ignored for commands that don't accept them
      return config.handler(params)
    },
  }
}

/**
 * Factory for commands that accept arguments.
 * The handler receives both params and args.
 */
export function defineCommandWithArgs(
  config: CommandWithArgsConfig,
): CommandDefinition {
  return {
    name: config.name,
    aliases: config.aliases ?? [],
    acceptsArgs: true,
    handler: config.handler,
  }
}

const clearInput = (params: RouterParams) => {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

const FREEBUFF_REMOVED_COMMANDS = new Set([
  'usage',
  'subscribe',
  'image',
  'publish',
  'general-agent',
  'setup',
  'models',
  'provider',
])

const FREEBUFF_ONLY_COMMANDS = new Set([
  'connect',
  'plan',
  'end-session',
])

const ALL_COMMANDS: CommandDefinition[] = [
  defineCommand({
    name: 'help',
    aliases: ['h', '?'],
    handler: async (params) => {
      const { postUserMessage } = await handleHelpCommand()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'feedback',
    aliases: ['bug', 'report'],
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided feedback text directly, pre-populate the form
      if (trimmedArgs) {
        useFeedbackStore.getState().setFeedbackText(trimmedArgs)
        useFeedbackStore.getState().setFeedbackCursor(trimmedArgs.length)
      }

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openFeedbackMode: true }
    },
  }),
  defineCommandWithArgs({
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
  }),
  defineCommand({
    name: 'exit',
    aliases: ['quit', 'q'],
    handler: () => {
      process.kill(process.pid, 'SIGINT')
    },
  }),
  defineCommandWithArgs({
    name: 'new',
    aliases: ['n', 'clear', 'c', 'reset'],
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      // Clear the conversation
      params.setMessages(() => [])
      params.clearMessages()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      params.stopStreaming()

      // If user provided a message, send it as the first message in the new chat
      if (trimmedArgs) {
        // Re-enable queue processing so the message can be sent
        params.setCanProcessQueue(true)
        params.sendMessage({
          content: trimmedArgs,
          agentMode: params.agentMode,
        })
        setTimeout(() => {
          params.scrollToLatest()
        }, 0)
      } else {
        // Only disable queue if we're not sending a message
        params.setCanProcessQueue(false)
      }
    },
  }),
  defineCommand({
    name: 'init',
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
        const pendingAttachments = capturePendingAttachments()
        params.addToQueue(trimmed, pendingAttachments)
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
  }),
  defineCommandWithArgs({
    name: 'setup',
    handler: (params, args) => {
      const trimmedArgs = args.trim()
      if (!trimmedArgs) {
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return { openProviderPicker: true }
      }
      try {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(setupOpenbuffProviderFromArgs(args)),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(error instanceof Error ? error.message : String(error)),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return
    },
  }),
  defineCommandWithArgs({
    name: 'models',
    handler: (params, args) => {
      const trimmedArgs = args.trim()
      if (!trimmedArgs || trimmedArgs.match(/^(configure|wizard)$/)) {
        params.saveToHistory(params.inputValue.trim() || '/models')
        clearInput(params)
        return { openModelRoutePicker: true }
      }

      let message: string
      try {
        message = trimmedArgs
          ? configureOpenbuffModelFromArgs(args)
          : formatOpenbuffModelStatus()
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(message),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return
    },
  }),
  defineCommandWithArgs({
    name: 'provider',
    handler: async (params, args) => {
      const trimmedArgs = args.trim()
      if (!trimmedArgs || trimmedArgs.match(/^(add|wizard)$/)) {
        params.saveToHistory(params.inputValue.trim() || '/provider')
        clearInput(params)
        return { openProviderPicker: true }
      }

      let message: string
      let connectCodex = false
      try {
        if (trimmedArgs) {
          const result = await handleOpenbuffProviderCommand(args)
          message = result.message
          connectCodex = !!result.connectCodex
        } else {
          message = formatOpenbuffProviderStatus()
        }
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(message),
      ])
      if (connectCodex) {
        useChatStore.getState().setInputMode('connect:chatgpt')
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return
    },
  }),
  defineCommand({
    name: 'info',
    aliases: ['status'],
    handler: (params) => {
      try {
        const { postUserMessage } = handleInfoCommand()
        params.setMessages((prev) => postUserMessage(prev))
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(
            `Failed to gather info: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'usage',
    aliases: ['credits'],
    handler: async (params) => {
      const { postUserMessage } = await handleUsageCommand()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'subscribe',
    aliases: ['strong', 'sub', 'buy-credits'],
    handler: (params) => {
      safeOpen(WEBSITE_URL + '/subscribe')
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
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
  }),
  // Mode commands generated from AGENT_MODES (excluded in Freebuff)
  ...(IS_FREEBUFF ? [] : AGENT_MODES).map((mode) =>
    defineCommandWithArgs({
      name: `mode:${mode.toLowerCase()}`,
      aliases: [`model:${mode.toLowerCase()}`],
      handler: (params, args) => {
        const trimmedArgs = args.trim()

        useChatStore.getState().setAgentMode(mode)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Switched to ${mode} mode.`),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)

        // If user provided a message, send it in the new mode
        if (trimmedArgs) {
          params.setCanProcessQueue(true)
          params.sendMessage({
            content: trimmedArgs,
            agentMode: mode,
          })
          setTimeout(() => {
            params.scrollToLatest()
          }, 0)
        }
      },
    }),
  ),
  defineCommandWithArgs({
    name: 'publish',
    handler: (params, args) => {
      const trimmedArgs = args.trim()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided agent ids directly, skip to confirmation step
      if (trimmedArgs) {
        const agentIds = trimmedArgs.split(/\s+/).filter(Boolean)
        return { openPublishMode: true, preSelectAgents: agentIds }
      }

      // Otherwise open selection UI
      return { openPublishMode: true }
    },
  }),
  defineCommand({
    name: 'general-agent',
    handler: (params) => {
      // Insert @ General Agent into the input field (UI shortcut, not a real command)
      params.setInputValue({
        text: '@General Agent ',
        cursorPosition: '@General Agent '.length,
        lastEditDueToNav: false,
      })
      params.inputRef.current?.focus()
      // Don't save to history - this is just a UI shortcut
    },
  }),
  ...(CHATGPT_OAUTH_ENABLED
    ? [
        defineCommand({
          name: 'connect',
          aliases: ['connect:chatgpt', 'chatgpt'],
          handler: (params) => {
            useChatStore.getState().setInputMode('connect:chatgpt')
            params.saveToHistory(params.inputValue.trim())
            clearInput(params)
          },
        }),
      ]
    : []),
  defineCommand({
    name: 'history',
    aliases: ['chats'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openChatHistory: true }
    },
  }),
  defineCommandWithArgs({
    name: 'interview',
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided text directly, send it immediately
      if (trimmedArgs) {
        params.sendMessage({
          content: buildInterviewPrompt(trimmedArgs),
          agentMode: params.agentMode,
        })
        setTimeout(() => {
          params.scrollToLatest()
        }, 0)
        return
      }

      // Otherwise enter interview mode
      useChatStore.getState().setInputMode('interview')
    },
  }),
  defineCommandWithArgs({
    name: 'plan',
    handler: (params, args) => {
      // In freebuff mode, require ChatGPT connection
      if (IS_FREEBUFF && !getChatGptOAuthStatus().connected) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(
            'Connect your ChatGPT account to use /plan. Use /connect to get started.',
          ),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        useChatStore.getState().setInputMode('connect:chatgpt')
        return
      }

      const trimmedArgs = args.trim()

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided plan text directly, send it immediately
      if (trimmedArgs) {
        params.sendMessage({
          content: buildPlanPrompt(trimmedArgs),
          agentMode: params.agentMode,
        })
        setTimeout(() => {
          params.scrollToLatest()
        }, 0)
        return
      }

      // Otherwise enter plan mode
      useChatStore.getState().setInputMode('plan')
    },
  }),
  defineCommandWithArgs({
    name: 'review',
    handler: (params, args) => {
      // In freebuff mode, require ChatGPT connection
      if (IS_FREEBUFF && !getChatGptOAuthStatus().connected) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(
            'Connect your ChatGPT account to use /review. Use /connect to get started.',
          ),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        useChatStore.getState().setInputMode('connect:chatgpt')
        return
      }

      const trimmedArgs = args.trim()

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided review text directly, send it immediately without showing the screen
      if (trimmedArgs) {
        params.sendMessage({
          content: buildReviewPromptFromArgs(trimmedArgs),
          agentMode: params.agentMode,
        })
        setTimeout(() => {
          params.scrollToLatest()
        }, 0)
        return
      }

      // Otherwise open the selection UI
      return { openReviewScreen: true }
    },
  }),
  defineCommand({
    name: 'theme:toggle',
    handler: (params) => {
      const { theme, setThemeName } = useThemeStore.getState()
      const newTheme = theme.name === 'dark' ? 'light' : 'dark'
      setThemeName(newTheme)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Switched to ${newTheme} theme.`),
      ])
      clearInput(params)
    },
  }),
  // /end-session (freebuff-only)
  defineCommand({
    name: 'end-session',
    aliases: ['model'],
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(END_SESSION_MESSAGE),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      void returnToFreebuffLanding({ resetChat: true })
    },
  }),
]

export const COMMAND_REGISTRY: CommandDefinition[] = IS_FREEBUFF
  ? ALL_COMMANDS.filter((cmd) => !FREEBUFF_REMOVED_COMMANDS.has(cmd.name))
  : ALL_COMMANDS.filter((cmd) => !FREEBUFF_ONLY_COMMANDS.has(cmd.name))

export function findCommand(cmd: string): CommandDefinition | undefined {
  const lowerCmd = cmd.toLowerCase()

  // First check the static command registry
  const staticCommand = COMMAND_REGISTRY.find(
    (def) => def.name === lowerCmd || def.aliases.includes(lowerCmd),
  )
  if (staticCommand) {
    return staticCommand
  }

  // Check if this is a skill command (prefixed with "skill:")
  if (lowerCmd.startsWith('skill:')) {
    const skillName = lowerCmd.slice('skill:'.length)
    const skill = getSkillByName(skillName)
    if (skill) {
      return createSkillCommand(skill.name)
    }
  }

  return undefined
}

/**
 * Creates a dynamic command definition for a skill.
 * When invoked, the skill's content is sent to the agent.
 */
function createSkillCommand(skillName: string): CommandDefinition {
  return defineCommandWithArgs({
    name: skillName,
    handler: (params, args) => {
      const skill = getSkillByName(skillName)
      if (!skill) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Skill not found: ${skillName}`),
        ])
        params.saveToHistory(params.inputValue.trim())
        params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
        return
      }

      const trimmed = params.inputValue.trim()
      params.saveToHistory(trimmed)
      params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

      // Build the message content with skill context and optional user args
      const skillContext = `<skill name="${skill.name}">
${skill.content}
</skill>`

      const userPrompt = `I invoke the following skill:\n\n${skillContext}\n\n`
        + (args.trim()
          ? `User request: ${args.trim()}`
          : '')

      // Check streaming/queue state
      if (
        params.isStreaming ||
        params.streamMessageIdRef.current ||
        params.isChainInProgressRef.current
      ) {
        const pendingAttachments = capturePendingAttachments()
        params.addToQueue(userPrompt, pendingAttachments)
        params.setInputFocused(true)
        params.inputRef.current?.focus()
        return
      }

      params.sendMessage({
        content: userPrompt,
        agentMode: params.agentMode,
      })
      setTimeout(() => {
        params.scrollToLatest()
      }, 0)
    },
  })
}