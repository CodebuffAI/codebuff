import { existsSync } from 'node:fs'

import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import {
  isValidPlanSlug,
  writeActiveSessionPointer,
} from '@codebuff/common/util/plan-artifacts'

import { registerPlanTimelineCommand } from './plan-timeline'
import { handleHelpCommand } from './help'
import { handleImageCommand } from './image'
import { handleInfoCommand } from './info'
import { handleInitializationFlowLocally } from './init'
import {
  formatArtifactsForPrompt,
  getActivePlanSessionSlug,
  hasAnyArtifact,
  listPlanSessions,
  PLAN_ARTIFACT_NAMES,
  readPlanArtifacts,
  resolvePlanSessionDir,
} from './plan-artifacts'
import {
  buildInterviewPrompt,
  buildLessonsPrompt,
  buildPlanPrompt,
  buildResumePlanPrompt,
  buildReviewPromptFromArgs,
  buildUpdatePlanPrompt,
  splitPlanCommandArgs,
} from './prompt-builders'
import { runBashCommand } from './router'
import { useThemeStore } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import { useFeedbackStore } from '../state/feedback-store'
import { AGENT_MODES } from '../utils/constants'
import { getSystemMessage, getUserMessage } from '../utils/message-history'
import {
  configureOpenbuffModelFromArgs,
  formatOpenbuffModelStatus,
  formatOpenbuffProviderStatus,
  handleOpenbuffProviderCommand,
  setupOpenbuffProviderFromArgs,
} from '../utils/openbuff-provider'
import { capturePendingAttachments } from '../utils/pending-attachments'
import { fuzzyMatch } from '../utils/fuzzy-match'
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
  openPromptHistorySearch?: boolean
  openReviewScreen?: boolean
  openModelRoutePicker?: boolean
  openProviderPicker?: boolean
  openPlanSessionPicker?: string
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

const sendPromptCommand = (
  params: RouterParams,
  prompt: string,
  mode: AgentMode = params.agentMode,
) => {
  params.sendMessage({
    content: prompt,
    agentMode: mode,
  })
  setTimeout(() => {
    params.scrollToLatest()
  }, 0)
}

const appendLocalMessage = (params: RouterParams, body: string) => {
  params.setMessages((prev) => [
    ...prev,
    getUserMessage(params.inputValue.trim()),
    getSystemMessage(body),
  ])
}

const showMissingArtifactsMessage = (
  params: RouterParams,
  command: string,
  sessionDir: string,
) => {
  appendLocalMessage(
    params,
    `/${command}: no plan artifacts found under ${sessionDir}. Expected one of: ${PLAN_ARTIFACT_NAMES.join(', ')}.`,
  )
}

const openPlanSessionPicker = (
  params: RouterParams,
  command: string,
): CommandResult => {
  clearInput(params)
  return { openPlanSessionPicker: command }
}

const formatPlanStatusReport = (
  sessionDir: string,
  artifacts: ReturnType<typeof readPlanArtifacts>,
): string => {
  if (!artifacts) {
    return `/plan-status: session directory ${sessionDir} not found.`
  }
  const lines: string[] = [`Plan status for ${artifacts.sessionDir}:`]
  const present = PLAN_ARTIFACT_NAMES.filter(
    (name) => artifacts.presentPaths[name],
  )
  if (present.length === 0) {
    lines.push('  (no plan artifacts found)')
  } else {
    lines.push('Artifacts found:')
    for (const name of present) {
      lines.push(`  - ${artifacts.presentPaths[name]}`)
    }
  }
  if (artifacts.missing.length > 0) {
    lines.push(`Missing: ${artifacts.missing.join(', ')}`)
  }
  const status = artifacts.files['STATUS.md']
  if (status) {
    lines.push('', `STATUS.md:`, status.trimEnd())
  }
  return lines.join('\n')
}

const STATUS_BADGE: Record<string, string> = {
  active: '[active]   ',
  paused: '[paused]   ',
  completed: '[completed]',
  archived: '[archived] ',
}

const formatPlanListReport = (): string => {
  const sessions = listPlanSessions()
  if (sessions.length === 0) {
    return [
      'No plan sessions found under .agents/sessions/.',
      'Use /plan <slug> to start one, or /plans for this list.',
    ].join('\n')
  }
  const active = getActivePlanSessionSlug()
  const lines: string[] = [`Plan sessions (${sessions.length}):`]
  for (const session of sessions) {
    const badge = STATUS_BADGE[session.status] ?? `[${session.status}]`
    const activeMarker = session.isActive ? ' * ' : '   '
    const progress =
      session.progress.total > 0
        ? ` ${session.progress.done}/${session.progress.total} done`
        : ''
    const current = session.currentTask ? `  current: "${session.currentTask}"` : ''
    lines.push(
      `${activeMarker}${badge} ${session.slug}${progress}${current}`,
    )
  }
  if (active) {
    lines.push('', `Active session: ${active}`)
  }
  return lines.join('\n')
}

const setPlanUse = (slug: string): string => {
  const trimmed = slug.trim()
  if (!trimmed) {
    return '/plan-use: missing session slug. Usage: /plan-use <slug>.'
  }
  if (!isValidPlanSlug(trimmed)) {
    return `/plan-use: invalid slug "${trimmed}". Slugs may contain letters, digits, dots, underscores, and dashes.`
  }
  const resolved = resolvePlanSessionDir(trimmed)
  if (!resolved.ok) {
    return `/plan-use: ${resolved.error}`
  }
  // Reject slugs whose session directory does not exist on disk; otherwise the
  // active-session pointer becomes stale and the next agent run silently "uses"
  // a session that has no artifacts.
  if (!existsSync(resolved.absSessionDir)) {
    return `/plan-use: no plan session found at ${resolved.sessionDir}. Use /plans to list existing sessions, or /plan <slug> to start one.`
  }
  const written = writeActiveSessionPointer(trimmed)
  if (!written) {
    return '/plan-use: failed to write .agents/ACTIVE_SESSION (project root not set?).'
  }
  return `Active session set to ${trimmed} (${resolved.sessionDir}).`
}

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
  defineCommandWithArgs({
    name: 'diff',
    handler: (params, args) => {
      const trimmedArgs = args.trim()
      // /diff with no args: unstaged diff. With args: pass through (e.g. --cached, --stat).
      const command = trimmedArgs
        ? `git diff ${trimmedArgs}`
        : 'git diff'
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      runBashCommand(command)
    },
  }),
  defineCommandWithArgs({
    name: 'changes',
    handler: (params, args) => {
      const trimmedArgs = args.trim()
      const command = trimmedArgs
        ? `git status ${trimmedArgs}`
        : 'git status --short'
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      runBashCommand(command)
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

      // Snapshot the current conversation so it can be restored with /undo.
      useChatStore.getState().pushMessageSnapshot()

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
    name: 'undo',
    handler: (params) => {
      const hadSnapshot =
        useChatStore.getState().pastMessageSnapshots.length > 0
      useChatStore.getState().undoMessages()
      const message = hadSnapshot
        ? 'Reverted to previous conversation state.'
        : 'Nothing to undo.'
      params.setMessages((prev) => [...prev, getSystemMessage(message)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'redo',
    handler: (params) => {
      const hadSnapshot =
        useChatStore.getState().futureMessageSnapshots.length > 0
      useChatStore.getState().redoMessages()
      const message = hadSnapshot
        ? 'Re-applied undone conversation state.'
        : 'Nothing to redo.'
      params.setMessages((prev) => [...prev, getSystemMessage(message)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
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
  // Mode commands generated from AGENT_MODES
  ...AGENT_MODES.map((mode) =>
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
  defineCommand({
    name: 'prompts',
    aliases: ['prompt-search'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openPromptHistorySearch: true }
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
      const trimmedArgs = args.trim()

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided plan text directly, send it immediately in plan mode
      if (trimmedArgs) {
        sendPromptCommand(params, buildPlanPrompt(trimmedArgs), 'PLAN')
        return
      }

      // Otherwise enter plan mode
      useChatStore.getState().setInputMode('plan')
    },
  }),
  defineCommandWithArgs({
    name: 'resume-plan',
    aliases: ['rp'],
    handler: (params, args) => {
      params.saveToHistory(params.inputValue.trim())
      const parsed = splitPlanCommandArgs(args)
      if (!parsed) {
        return openPlanSessionPicker(params, 'resume-plan')
      }
      const resolved = resolvePlanSessionDir(parsed.target)
      if (!resolved.ok) {
        appendLocalMessage(params, `/resume-plan: ${resolved.error}`)
        clearInput(params)
        return
      }
      const artifacts = readPlanArtifacts(parsed.target)
      if (!hasAnyArtifact(artifacts)) {
        showMissingArtifactsMessage(params, 'resume-plan', resolved.sessionDir)
        clearInput(params)
        return
      }
      clearInput(params)
      sendPromptCommand(
        params,
        buildResumePlanPrompt({
          target: artifacts!.sessionDir,
          artifactsText: formatArtifactsForPrompt(artifacts!),
        }),
        'EXECUTE_PLAN',
      )
    },
  }),
  defineCommandWithArgs({
    name: 'update-plan',
    aliases: ['up'],
    handler: (params, args) => {
      params.saveToHistory(params.inputValue.trim())
      const parsed = splitPlanCommandArgs(args)
      if (!parsed) {
        return openPlanSessionPicker(params, 'update-plan')
      }
      const resolved = resolvePlanSessionDir(parsed.target)
      if (!resolved.ok) {
        appendLocalMessage(params, `/update-plan: ${resolved.error}`)
        clearInput(params)
        return
      }
      const artifacts = readPlanArtifacts(parsed.target)
      if (!hasAnyArtifact(artifacts)) {
        showMissingArtifactsMessage(params, 'update-plan', resolved.sessionDir)
        clearInput(params)
        return
      }
      clearInput(params)
      sendPromptCommand(
        params,
        buildUpdatePlanPrompt({
          target: artifacts!.sessionDir,
          artifactsText: formatArtifactsForPrompt(artifacts!),
          note: parsed.note,
        }),
        'PLAN',
      )
    },
  }),
  defineCommandWithArgs({
    name: 'plan-status',
    aliases: ['ps'],
    handler: (params, args) => {
      params.saveToHistory(params.inputValue.trim())
      const parsed = splitPlanCommandArgs(args)
      if (!parsed) {
        return openPlanSessionPicker(params, 'plan-status')
      }
      const resolved = resolvePlanSessionDir(parsed.target)
      if (!resolved.ok) {
        appendLocalMessage(params, `/plan-status: ${resolved.error}`)
        clearInput(params)
        return
      }
      const artifacts = readPlanArtifacts(parsed.target)
      appendLocalMessage(
        params,
        formatPlanStatusReport(resolved.sessionDir, artifacts),
      )
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'plans',
    aliases: ['plan-ls'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      appendLocalMessage(params, formatPlanListReport())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'plan-use',
    aliases: ['plan-active', 'use-plan'],
    handler: (params, args) => {
      params.saveToHistory(params.inputValue.trim())
      const trimmed = args.trim()
      if (!trimmed) {
        appendLocalMessage(
          params,
          '/plan-use: missing session slug. Usage: /plan-use <slug>.',
        )
        clearInput(params)
        return
      }
      appendLocalMessage(params, setPlanUse(trimmed))
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'lessons',
    aliases: ['lesson'],
    handler: (params, args) => {
      params.saveToHistory(params.inputValue.trim())
      const parsed = splitPlanCommandArgs(args)
      if (!parsed) {
        return openPlanSessionPicker(params, 'lessons')
      }
      const resolved = resolvePlanSessionDir(parsed.target)
      if (!resolved.ok) {
        appendLocalMessage(params, `/lessons: ${resolved.error}`)
        clearInput(params)
        return
      }
      const artifacts = readPlanArtifacts(parsed.target)
      if (!hasAnyArtifact(artifacts)) {
        showMissingArtifactsMessage(params, 'lessons', resolved.sessionDir)
        clearInput(params)
        return
      }
      clearInput(params)
      sendPromptCommand(
        params,
        buildLessonsPrompt({
          target: artifacts!.sessionDir,
          artifactsText: formatArtifactsForPrompt(artifacts!),
          note: parsed.note,
        }),
        'PLAN',
      )
    },
  }),
  defineCommandWithArgs({
    name: 'review',
    handler: (params, args) => {
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
  registerPlanTimelineCommand(),
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
]

export const COMMAND_REGISTRY: CommandDefinition[] = ALL_COMMANDS

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
 * Suggests the closest known slash commands for a user's attempted (but
 * unknown) command. Uses fuzzy matching against every command name and alias.
 *
 * Returns up to `limit` (default 3) candidates, each prefixed with `/` and
 * sorted best-first. Returns an empty array when `attempted` is empty or no
 * candidate scores within `maxScore` (default 30, lower=better in fuzzyMatch).
 */
export function findCommandSuggestions(
  attempted: string,
  opts?: { limit?: number; maxScore?: number },
): string[] {
  const query = attempted.trim()
  if (query.length === 0) {
    return []
  }

  const limit = opts?.limit ?? 3
  const maxScore = opts?.maxScore ?? 30

  // Enumerate every command id (name + each alias) and dedupe.
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const command of COMMAND_REGISTRY) {
    for (const candidate of [command.name, ...command.aliases]) {
      if (seen.has(candidate)) {
        continue
      }
      seen.add(candidate)
      candidates.push(candidate)
    }
  }

  const scored: { candidate: string; score: number }[] = []
  for (const candidate of candidates) {
    const match = fuzzyMatch(candidate, query)
    if (match === null) {
      continue
    }
    if (match.score <= maxScore) {
      scored.push({ candidate, score: match.score })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score
    }
    return a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0
  })

  return scored.slice(0, limit).map((entry) => `/${entry.candidate}`)
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