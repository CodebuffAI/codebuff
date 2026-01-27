import { runTerminalCommand } from '@codebuff/sdk'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import {
  findCommand,
  type RouterParams,
  type CommandResult,
} from './command-registry'
import { handleReferralCode } from './referral'
import {
  isSlashCommand,
  isReferralCode,
  extractReferralCode,
  normalizeReferralCode,
  parseCommandInput,
} from './router-utils'
import { handleClaudeAuthCode } from '../components/claude-connect-banner'
import { handleCodexAuthCode } from '../components/codex-connect-banner'
import { getProjectRoot } from '../project-files'
import { useChatStore } from '../state/chat-store'
import {
  capturePendingAttachments,
  hasProcessingImages,
  validateAndAddImage,
} from '../utils/pending-attachments'
import {
  buildBashHistoryMessages,
  createRunTerminalToolResult,
} from '../utils/bash-messages'
import { showClipboardMessage } from '../utils/clipboard'
import { getSystemProcessEnv } from '../utils/env'
import { getSystemMessage, getUserMessage } from '../utils/message-history'
import { trackEvent } from '../utils/analytics'

/**
 * Run a bash command with automatic ghost/direct mode selection.
 * Uses ghost mode when streaming or chain in progress, otherwise adds directly to chat history.
 */
export function runBashCommand(command: string) {
  const {
    streamingAgents,
    isChainInProgress,
    setMessages,
    addPendingBashMessage,
    updatePendingBashMessage,
  } = useChatStore.getState()

  const ghost = streamingAgents.size > 0 || isChainInProgress
  const id = crypto.randomUUID()
  const commandCwd = process.cwd()
  const startTime = Date.now()

  if (ghost) {
    // Ghost mode: add to pending messages
    addPendingBashMessage({
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
    // Direct mode: add to chat history with placeholder output (user + assistant)
    const { assistantMessage } = buildBashHistoryMessages({
      command,
      cwd: commandCwd,
      toolCallId: id,
      output: '...',
    })
    setMessages((prev) => [...prev, assistantMessage])
  }

  runTerminalCommand({
    command,
    process_type: 'SYNC',
    cwd: commandCwd,
    timeout_seconds: -1,
    env: getSystemProcessEnv(),
  })
    .then(([{ value }]) => {
      const stdout = 'stdout' in value ? value.stdout || '' : ''
      const stderr = 'stderr' in value ? value.stderr || '' : ''
      const exitCode = 'exitCode' in value ? value.exitCode ?? 0 : 0

      // Track terminal command completion
      const durationMs = Date.now() - startTime
      trackEvent(AnalyticsEvent.TERMINAL_COMMAND_COMPLETED, {
        command: command.split(' ')[0], // Just the command name, not args
        exitCode,
        success: exitCode === 0,
        ghost,
        durationMs,
        hasStdout: stdout.length > 0,
        hasStderr: stderr.length > 0,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      })

      if (ghost) {
        updatePendingBashMessage(id, {
          stdout,
          stderr,
          exitCode,
          isRunning: false,
        })
      } else {
        const toolResultOutput = createRunTerminalToolResult({
          command,
          cwd: commandCwd,
          stdout: stdout || null,
          stderr: stderr || null,
          exitCode,
        })
        const outputJson = JSON.stringify(toolResultOutput)

        setMessages((prev) =>
          prev.map((msg) => {
            if (!msg.blocks) return msg
            let didUpdate = false
            const blocks = msg.blocks.map((block) => {
              if ('toolCallId' in block && block.toolCallId === id) {
                didUpdate = true
                return { ...block, output: outputJson }
              }
              return block
            })
            return didUpdate ? { ...msg, blocks, isComplete: true } : msg
          }),
        )

        // Also add to pending bash messages so the next user message includes this context for the LLM
        // Mark as already added to history to avoid duplicate UI entries
        addPendingBashMessage({
          id,
          command,
          stdout,
          stderr,
          exitCode,
          isRunning: false,
          cwd: commandCwd,
          addedToHistory: true,
        })
      }
    })
    .catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      // Track terminal command completion with error
      const durationMs = Date.now() - startTime
      trackEvent(AnalyticsEvent.TERMINAL_COMMAND_COMPLETED, {
        command: command.split(' ')[0], // Just the command name, not args
        exitCode: 1,
        success: false,
        ghost,
        durationMs,
        hasStdout: false,
        hasStderr: true,
        stdoutLength: 0,
        stderrLength: errorMessage.length,
        isException: true,
      })

      if (ghost) {
        updatePendingBashMessage(id, {
          stdout: '',
          stderr: errorMessage,
          exitCode: 1,
          isRunning: false,
        })
      } else {
        const errorToolResultOutput = createRunTerminalToolResult({
          command,
          cwd: commandCwd,
          stdout: null,
          stderr: null,
          exitCode: 1,
          errorMessage,
        })
        const errorOutputJson = JSON.stringify(errorToolResultOutput)

        setMessages((prev) =>
          prev.map((msg) => {
            if (!msg.blocks) return msg
            let didUpdate = false
            const blocks = msg.blocks.map((block) => {
              if ('toolCallId' in block && block.toolCallId === id) {
                didUpdate = true
                return { ...block, output: errorOutputJson }
              }
              return block
            })
            return didUpdate ? { ...msg, blocks, isComplete: true } : msg
          }),
        )

        // Also add to pending bash messages so the next user message includes this context for the LLM
        // Mark as already added to history to avoid duplicate UI entries
        addPendingBashMessage({
          id,
          command,
          stdout: '',
          stderr: errorMessage,
          exitCode: 1,
          isRunning: false,
          cwd: commandCwd,
          addedToHistory: true,
        })
      }
    })
}

/**
 * Add a completed bash command result to the chat message history.
 * Note: This is UI-only; we no longer send these commands to the AI context.
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
  const toolResultOutput = createRunTerminalToolResult({
    command,
    cwd,
    stdout: stdout || null,
    stderr: stderr ?? null,
    exitCode,
  })
  const toolCallId = crypto.randomUUID()
  const outputJson = JSON.stringify(toolResultOutput)
  const { assistantMessage } = buildBashHistoryMessages({
    command,
    cwd,
    toolCallId,
    output: outputJson,
    isComplete: true,
  })

  setMessages((prev) => [...prev, assistantMessage])
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
  const pendingAttachments = useChatStore.getState().pendingAttachments
  const pendingImages = pendingAttachments.filter((a) => a.kind === 'image')
  const pendingTextAttachments = pendingAttachments.filter(
    (a) => a.kind === 'text',
  )

  const trimmed = inputValue.trim()
  // Allow empty messages if there are pending attachments (images or text)
  const hasAttachments = pendingAttachments.length > 0
  if (!trimmed && !hasAttachments) return

  // Track user input complete
  // Count @ mentions (simple pattern match - more accurate than nothing)
  const mentionMatches = trimmed.match(/@\S+/g) || []
  trackEvent(AnalyticsEvent.USER_INPUT_COMPLETE, {
    inputLength: trimmed.length,
    mode: agentMode,
    inputMode,
    hasImages: pendingImages.length > 0,
    imageCount: pendingImages.length,
    hasTextAttachments: pendingTextAttachments.length > 0,
    textAttachmentCount: pendingTextAttachments.length,
    isSlashCommand: isSlashCommand(trimmed),
    isBashCommand: trimmed.startsWith('!'),
    hasMentions: mentionMatches.length > 0,
    mentionCount: mentionMatches.length,
  })

  // Handle bash mode commands
  if (inputMode === 'bash') {
    const commandWithBang = '!' + trimmed
    saveToHistory(commandWithBang)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    setInputMode('default')
    setInputFocused(true)
    inputRef.current?.focus()

    runBashCommand(trimmed)
    return
  }

  // Handle bash commands from queue (starts with '!')
  if (trimmed.startsWith('!') && trimmed.length > 1) {
    const command = trimmed.slice(1)
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    runBashCommand(command)
    return
  }

  // Handle image mode input
  if (inputMode === 'image') {
    const imagePath = trimmed
    const projectRoot = getProjectRoot()

    // Validate and add the image (handles path resolution, format check, and processing)
    const result = await validateAndAddImage(imagePath, projectRoot)
    if (!result.success) {
      setMessages((prev) => [
        ...prev,
        getUserMessage(trimmed),
        getSystemMessage(`❌ ${result.error}`),
      ])
    }

    // Note: No system message added here - the PendingImagesBanner shows attached images
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    setInputMode('default')
    return
  }

  // Handle connect:claude mode input (authorization code)
  if (inputMode === 'connect:claude') {
    const code = trimmed
    if (code) {
      const result = await handleClaudeAuthCode(code)
      setMessages((prev) => [
        ...prev,
        getUserMessage(trimmed),
        getSystemMessage(result.message),
      ])
    }
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    setInputMode('default')
    return
  }

  // Handle connect:codex mode input (authorization code)
  if (inputMode === 'connect:codex') {
    const code = trimmed
    if (code) {
      const result = await handleCodexAuthCode(code)
      setMessages((prev) => [
        ...prev,
        getUserMessage(trimmed),
        getSystemMessage(result.message),
      ])
    }
    saveToHistory(trimmed)
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    setInputMode('default')
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

  // Handle slash commands or configured slashless exact commands.
  const parsedCommand = parseCommandInput(trimmed)
  if (parsedCommand) {
    const commandDef = findCommand(parsedCommand.command)
    if (commandDef) {
      const argsLength = parsedCommand.args.length
      const analyticsPayload = {
        command: commandDef.name,
        hasArgs: argsLength > 0,
        argsLength,
        agentMode,
        ...(parsedCommand.implicitCommand ? { implicitCommand: true } : {}),
      }

      trackEvent(AnalyticsEvent.SLASH_COMMAND_USED, analyticsPayload)

      // The command handler (via defineCommand/defineCommandWithArgs factories)
      // is responsible for validating and handling args
      return await commandDef.handler(params, parsedCommand.args)
    }
  }

  // Regular message or unknown slash command - send to agent

  // Block sending if images are still processing
  if (hasProcessingImages()) {
    showClipboardMessage('processing images...', {
      durationMs: 2000,
    })
    return
  }

  saveToHistory(trimmed)
  setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

  if (
    isStreaming ||
    streamMessageIdRef.current ||
    isChainInProgressRef.current
  ) {
    const pendingAttachmentsForQueue = capturePendingAttachments()
    // Pass a copy of pending attachments to the queue
    addToQueue(trimmed, pendingAttachmentsForQueue)

    setInputFocused(true)
    inputRef.current?.focus()
    return
  }

  // Unknown slash command - show error
  if (isSlashCommand(trimmed)) {
    // Track invalid/unknown command (only log command name, not full input for privacy)
    const attemptedCmd = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() || ''
    trackEvent(AnalyticsEvent.INVALID_COMMAND, {
      attemptedCommand: attemptedCmd,
      inputLength: trimmed.length,
      agentMode,
    })

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
