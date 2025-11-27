import { runTerminalCommand } from '@codebuff/sdk'

import {
  findCommand,
  type RouterParams,
  type CommandResult,
} from './command-registry'
import { handleReferralCode } from './referral'
import {
  parseCommand,
  isSlashCommand,
  isReferralCode,
  extractReferralCode,
  normalizeReferralCode,
} from './router-utils'
import { useChatStore } from '../state/chat-store'
import { getSystemMessage, getUserMessage } from '../utils/message-history'

import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { ContentBlock } from '../types/chat'
import type { PendingBashMessage } from '../state/chat-store'

/**
 * Create a tool result output structure for terminal command results.
 */
function createToolResultOutput(params: {
  command: string
  cwd: string
  stdout: string | null
  stderr: string | null
  exitCode: number
  errorMessage?: string
}): ToolResultOutput[] {
  const { command, cwd, stdout, stderr, exitCode, errorMessage } = params
  if (errorMessage) {
    return [
      {
        type: 'json' as const,
        value: { command, startingCwd: cwd, errorMessage },
      },
    ]
  }
  return [
    {
      type: 'json' as const,
      value: {
        command,
        startingCwd: cwd,
        stdout: stdout || null,
        stderr: stderr || null,
        exitCode,
      },
    },
  ]
}

/**
 * Execute a bash command.
 * When ghost=false: adds directly to chat history with placeholder output that updates.
 * When ghost=true: adds to pending messages that appear as ghost while running.
 */
function executeBashCommand(
  command: string,
  options:
    | { ghost: false; setMessages: RouterParams['setMessages'] }
    | {
        ghost: true
        addPendingBashMessage: (msg: PendingBashMessage) => void
        updatePendingBashMessage: (
          id: string,
          updates: Partial<PendingBashMessage>,
        ) => void
      },
) {
  const id = crypto.randomUUID()
  const commandCwd = process.cwd()

  if (options.ghost) {
    // Ghost mode: add to pending messages
    options.addPendingBashMessage({
      id,
      command,
      stdout: '',
      stderr: '',
      exitCode: 0,
      isRunning: true,
      startTime: Date.now(),
      cwd: commandCwd,
    })
  } else {
    // Direct mode: add to chat history with placeholder
    const resultBlock: ContentBlock = {
      type: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: id,
      input: { command },
      output: '...',
    }
    options.setMessages((prev) => [
      ...prev,
      {
        ...getUserMessage([resultBlock]),
        metadata: { bashCwd: commandCwd },
      },
    ])
  }

  runTerminalCommand({
    command,
    process_type: 'SYNC',
    cwd: commandCwd,
    timeout_seconds: -1,
    env: process.env,
  })
    .then(([{ value }]) => {
      const stdout = 'stdout' in value ? value.stdout || '' : ''
      const stderr = 'stderr' in value ? value.stderr || '' : ''
      const exitCode = 'exitCode' in value ? value.exitCode ?? 0 : 0
      const rawOutput = stdout + stderr
      const output = rawOutput || '(no output)'

      if (options.ghost) {
        options.updatePendingBashMessage(id, {
          stdout,
          stderr,
          exitCode,
          isRunning: false,
        })
      } else {
        const toolResultOutput = createToolResultOutput({
          command,
          cwd: commandCwd,
          stdout: stdout || null,
          stderr: stderr || null,
          exitCode,
        })
        const outputJson = JSON.stringify(toolResultOutput)

        options.setMessages((prev) =>
          prev.map((msg) => {
            if (!msg.blocks) return msg
            return {
              ...msg,
              blocks: msg.blocks.map((block) =>
                'toolCallId' in block && block.toolCallId === id
                  ? { ...block, output: outputJson }
                  : block,
              ),
            }
          }),
        )

        // Add to pending tool results so AI can see this in the next run
        const toolMessage: ToolMessage = {
          role: 'tool',
          toolCallId: id,
          toolName: 'run_terminal_command',
          content: toolResultOutput,
        }
        useChatStore.getState().addPendingToolResult(toolMessage)
      }
    })
    .catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const output = `Error: ${errorMessage}`

      if (options.ghost) {
        options.updatePendingBashMessage(id, {
          stdout: '',
          stderr: errorMessage,
          exitCode: 1,
          isRunning: false,
        })
      } else {
        const errorToolResultOutput = createToolResultOutput({
          command,
          cwd: commandCwd,
          stdout: null,
          stderr: null,
          exitCode: 1,
          errorMessage,
        })
        const errorOutputJson = JSON.stringify(errorToolResultOutput)

        options.setMessages((prev) =>
          prev.map((msg) => {
            if (!msg.blocks) return msg
            return {
              ...msg,
              blocks: msg.blocks.map((block) =>
                'toolCallId' in block && block.toolCallId === id
                  ? { ...block, output: errorOutputJson }
                  : block,
              ),
            }
          }),
        )

        const errorToolMessage: ToolMessage = {
          role: 'tool',
          toolCallId: id,
          toolName: 'run_terminal_command',
          content: errorToolResultOutput,
        }
        useChatStore.getState().addPendingToolResult(errorToolMessage)
      }
    })
}

/**
 * Add a completed bash command result to the chat message history.
 * Also adds to pendingToolResults so the AI can see it in the next run.
 */
export function addBashMessageToHistory(params: {
  command: string
  stdout: string
  stderr: string | null
  exitCode: number
  cwd: string
  setMessages: RouterParams['setMessages']
}) {
  const { command, stdout, stderr, exitCode, cwd, setMessages } = params
  const outputText = stdout || stderr || '(no output)'
  const toolCallId = crypto.randomUUID()
  const resultBlock: ContentBlock = {
    type: 'tool',
    toolName: 'run_terminal_command',
    toolCallId,
    input: { command },
    output: outputText,
  }

  setMessages((prev) => [
    ...prev,
    {
      ...getUserMessage([resultBlock]),
      metadata: { bashCwd: cwd },
    },
  ])

  const toolResultOutput = createToolResultOutput({
    command,
    cwd,
    stdout: stdout || null,
    stderr: stderr ?? null,
    exitCode,
  })
  const toolMessage: ToolMessage = {
    role: 'tool',
    toolCallId,
    toolName: 'run_terminal_command',
    content: toolResultOutput,
  }
  useChatStore.getState().addPendingToolResult(toolMessage)
}

export async function routeUserPrompt(
  params: RouterParams,
): Promise<CommandResult> {
  const {
    agentMode,
    inputRef,
    inputValue,
    isChainInProgressRef,
    isStreaming,
    streamMessageIdRef,
    addToQueue,
    saveToHistory,
    scrollToLatest,
    sendMessage,
    setInputFocused,
    setInputValue,
    setMessages,
  } = params

  const inputMode = useChatStore.getState().inputMode
  const setInputMode = useChatStore.getState().setInputMode

  const trimmed = inputValue.trim()
  const isBusy =
    isStreaming || streamMessageIdRef.current || isChainInProgressRef.current
  if (!trimmed) return

  // Handle bash mode commands
  if (inputMode === 'bash') {
    const commandWithBang = '!' + trimmed
    saveToHistory(commandWithBang)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    setInputMode('default')
    setInputFocused(true)
    inputRef.current?.focus()

    if (isBusy) {
      const { addPendingBashMessage, updatePendingBashMessage } =
        useChatStore.getState()
      executeBashCommand(trimmed, {
        ghost: true,
        addPendingBashMessage,
        updatePendingBashMessage,
      })
    } else {
      executeBashCommand(trimmed, { ghost: false, setMessages })
    }
    return
  }

  // Handle bash commands from queue (starts with '!')
  if (trimmed.startsWith('!') && trimmed.length > 1) {
    const command = trimmed.slice(1)

    if (isBusy) {
      const { addPendingBashMessage, updatePendingBashMessage } =
        useChatStore.getState()
      executeBashCommand(command, {
        ghost: true,
        addPendingBashMessage,
        updatePendingBashMessage,
      })
    } else {
      executeBashCommand(command, { ghost: false, setMessages })
    }
    return
  }

  // Handle referral mode input
  if (inputMode === 'referral') {
    // Validate the referral code (3-50 alphanumeric chars with optional dashes)
    const codePattern = /^[a-zA-Z0-9-]{3,50}$/
    // Strip prefix if present for validation (case-insensitive)
    const codeWithoutPrefix = trimmed.toLowerCase().startsWith('ref-')
      ? trimmed.slice(4)
      : trimmed

    if (!codePattern.test(codeWithoutPrefix)) {
      setMessages((prev) => [
        ...prev,
        getUserMessage(trimmed),
        getSystemMessage(
          'Invalid referral code format. Codes should be 3-50 alphanumeric characters.',
        ),
      ])
      saveToHistory(trimmed)
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
      setInputMode('default')
      return
    }

    const referralCode = normalizeReferralCode(trimmed)
    try {
      const { postUserMessage: referralPostMessage } =
        await handleReferralCode(referralCode)
      setMessages((prev) => [
        ...prev,
        getUserMessage(trimmed),
        ...referralPostMessage([]),
      ])
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      setMessages((prev) => [
        ...prev,
        getUserMessage(trimmed),
        getSystemMessage(`Error redeeming referral code: ${errorMessage}`),
      ])
    }
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    setInputMode('default')

    return
  }

  // Handle referral codes (ref-XXXX format)
  // Works with or without leading slash: "ref-123" or "/ref-123"
  if (isReferralCode(trimmed)) {
    const referralCode = extractReferralCode(trimmed)
    const { postUserMessage: referralPostMessage } =
      await handleReferralCode(referralCode)
    setMessages((prev) => [
      ...prev,
      getUserMessage(trimmed),
      ...referralPostMessage([]),
    ])
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    return
  }

  // Only process slash commands if input starts with '/'
  if (isSlashCommand(trimmed)) {
    const cmd = parseCommand(trimmed)
    const args = trimmed.slice(1 + cmd.length).trim()

    // Look up command in registry
    const commandDef = findCommand(cmd)
    if (commandDef) {
      return await commandDef.handler(params, args)
    }
  }

  // Regular message or unknown slash command - send to agent
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

  // Unknown slash command - show error
  if (isSlashCommand(trimmed)) {
    setMessages((prev) => [
      ...prev,
      getUserMessage(trimmed),
      getSystemMessage(`Command not found: ${JSON.stringify(trimmed)}`),
    ])
    return
  }

  sendMessage({ content: trimmed, agentMode })

  setTimeout(() => {
    scrollToLatest()
  }, 0)

  return
}
