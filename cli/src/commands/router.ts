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

  const isBashMode = useChatStore.getState().isBashMode
  const setBashMode = useChatStore.getState().setBashMode

  const trimmed = inputValue.trim()
  if (!trimmed) return

  // Handle bash mode commands
  if (isBashMode) {
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
    setBashMode(false)

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
