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

import type { ContentBlock } from '../types/chat'

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
  if (!trimmed) return

  // Handle bash mode commands
  if (inputMode === 'bash') {
    const commandWithBang = '!' + trimmed
    const toolCallId = crypto.randomUUID()
    const resultBlock: ContentBlock = {
      type: 'tool',
      toolName: 'run_terminal_command',
      toolCallId,
      input: { command: trimmed },
      output: '',
    }

    setMessages((prev) => [
      ...prev,
      getUserMessage(commandWithBang),
      getSystemMessage([resultBlock]),
    ])

    runTerminalCommand({
      command: trimmed,
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

    saveToHistory(commandWithBang)
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
