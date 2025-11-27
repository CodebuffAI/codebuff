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

/**
 * Execute a bash command and add it directly to chat history.
 * Shows immediate placeholder while running, then updates with output.
 */
function executeBashCommand(
  command: string,
  setMessages: RouterParams['setMessages'],
) {
  const toolCallId = crypto.randomUUID()
  const resultBlock: ContentBlock = {
    type: 'tool',
    toolName: 'run_terminal_command',
    toolCallId,
    input: { command },
    output: '...',
  }

  const commandCwd = process.cwd()

  // Add the command result to chat as a user message so the AI sees it as context
  setMessages((prev) => [
    ...prev,
    {
      ...getUserMessage([resultBlock]),
      metadata: { bashCwd: commandCwd },
    },
  ])

  // Execute the command and update the output when complete
  runTerminalCommand({
    command,
    process_type: 'SYNC',
    cwd: commandCwd,
    timeout_seconds: -1,
    env: process.env,
  }).then(([{ value }]) => {
    const stdout = 'stdout' in value ? (value.stdout || '') : ''
    const stderr = 'stderr' in value ? (value.stderr || '') : ''
    const exitCode = 'exitCode' in value ? value.exitCode : 0

    // Create tool result output for display
    const toolResultOutput = [{
      type: 'json' as const,
      value: {
        command,
        startingCwd: commandCwd,
        stdout: stdout || null,
        stderr: stderr || null,
        exitCode: exitCode ?? 0,
      }
    }]

    // Store output in JSON format for display
    const outputJson = JSON.stringify(toolResultOutput)

    setMessages((prev) => {
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
                  output: outputJson,
                }
              : block,
          ),
        }
      })
    })

    // Add to pending tool results so AI can see this in the next run
    const toolMessage: ToolMessage = {
      role: 'tool',
      toolCallId,
      toolName: 'run_terminal_command',
      content: toolResultOutput,
    }
    useChatStore.getState().addPendingToolResult(toolMessage)
  }).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Create error tool result output
    const errorToolResultOutput = [{
      type: 'json' as const,
      value: {
        command,
        startingCwd: commandCwd,
        errorMessage,
      }
    }]

    // Store error output in JSON format for display
    const errorOutputJson = JSON.stringify(errorToolResultOutput)

    setMessages((prev) => {
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
                  output: errorOutputJson,
                }
              : block,
          ),
        }
      })
    })

    // Add error result to pending tool results so AI can see this in the next run
    const errorToolMessage: ToolMessage = {
      role: 'tool',
      toolCallId,
      toolName: 'run_terminal_command',
      content: errorToolResultOutput,
    }
    useChatStore.getState().addPendingToolResult(errorToolMessage)
  })
}

/**
 * Add a bash command result to the chat message history.
 * Also adds to pendingToolResults so the AI can see it in the next run.
 */
export function addBashMessageToHistory(params: {
  command: string
  stdout: string
  stderr: string | null | undefined
  exitCode: number
  cwd: string
  displayOutput?: string
  setMessages: RouterParams['setMessages']
}) {
  const { command, stdout, stderr, exitCode, cwd, displayOutput, setMessages } =
    params
  const outputText =
    displayOutput ?? (stdout || stderr ? `${stdout}${stderr ?? ''}` : '')
  const toolCallId = crypto.randomUUID()
  const resultBlock: ContentBlock = {
    type: 'tool',
    toolName: 'run_terminal_command',
    toolCallId,
    input: { command },
    output: outputText || '(no output)',
  }

  // Add as a user message so the AI sees it as context
  setMessages((prev) => [
    ...prev,
    {
      ...getUserMessage([resultBlock]),
      metadata: { bashCwd: cwd },
    },
  ])

  // Also add to pending tool results so AI can see this in the next run
  const toolResultOutput: ToolResultOutput[] = [{
    type: 'json' as const,
    value: {
      command,
      startingCwd: cwd,
      stdout: stdout || null,
      stderr: stderr ?? null,
      exitCode: exitCode ?? 0,
    }
  }]
  const toolMessage: ToolMessage = {
    role: 'tool',
    toolCallId,
    toolName: 'run_terminal_command',
    content: toolResultOutput,
  }
  useChatStore.getState().addPendingToolResult(toolMessage)
}

/**
 * Execute a bash command as a ghost message in chat.
 * Shows as a pending message while running, then commits to history when streaming ends.
 */
function executeBashCommandAsGhost(
  command: string,
  addPendingBashMessage: (message: import('../state/chat-store').PendingBashMessage) => void,
  updatePendingBashMessage: (id: string, updates: Partial<import('../state/chat-store').PendingBashMessage>) => void,
) {
  const id = crypto.randomUUID()

  // Add pending message immediately with placeholder
  addPendingBashMessage({
    id,
    command,
    output: '',
    exitCode: -1, // Indicates running
    isRunning: true,
    startTime: Date.now(),
    cwd: process.cwd(),
  })

  runTerminalCommand({
    command,
    process_type: 'SYNC',
    cwd: process.cwd(),
    timeout_seconds: -1,
    env: process.env,
  })
    .then(([{ value }]) => {
      const stdout = 'stdout' in value ? value.stdout || '' : ''
      const stderr = 'stderr' in value ? value.stderr || '' : ''
      const rawOutput = stdout + stderr
      const output = rawOutput || '(no output)'
      const exitCode = 'exitCode' in value ? value.exitCode ?? 0 : 0

      updatePendingBashMessage(id, {
        output,
        exitCode,
        stdout,
        stderr,
        isRunning: false,
      })
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const output = `Error: ${errorMessage}`

      updatePendingBashMessage(id, {
        output,
        stdout: '',
        stderr: errorMessage,
        exitCode: 1,
        isRunning: false,
      })
    })
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
    isStreaming ||
    streamMessageIdRef.current ||
    isChainInProgressRef.current
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
      const { addPendingBashMessage, updatePendingBashMessage } = useChatStore.getState()
      executeBashCommandAsGhost(trimmed, addPendingBashMessage, updatePendingBashMessage)
    } else {
      executeBashCommand(trimmed, setMessages)
    }
    return
  }

  // Handle bash commands from queue (starts with '!')
  if (trimmed.startsWith('!') && trimmed.length > 1) {
    const command = trimmed.slice(1)

    if (isBusy) {
      const { addPendingBashMessage, updatePendingBashMessage } = useChatStore.getState()
      executeBashCommandAsGhost(command, addPendingBashMessage, updatePendingBashMessage)
    } else {
      executeBashCommand(command, setMessages)
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
        getSystemMessage('Invalid referral code format. Codes should be 3-50 alphanumeric characters.'),
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
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
