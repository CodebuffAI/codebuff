import { publisher } from './constants'

import type { AgentDefinition, ToolCall } from './types/agent-definition'
import type { Message, ToolMessage } from './types/util-types'
import type { CodebuffToolMessage } from '@codebuff/common/tools/list'

const definition: AgentDefinition = {
  id: 'context-pruner',
  publisher,
  displayName: 'Context Pruner',
  model: 'openai/gpt-5-mini',

  spawnerPrompt: `Spawn this agent between steps to prune context, starting with old tool results and then old messages.`,

  inputSchema: {
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
      },
      required: [],
    },
  },

  inheritParentSystemPrompt: true,
  includeMessageHistory: true,

  handleSteps: function* ({ agentState, params, logger }) {
    const messages = agentState.messageHistory

    // Anthropic image token formula: 85 + (num_tiles × 170), where tiles are ~512×512px
    // Our compression limits images to max 1500px on longest side (typically 800-1200px)
    // Worst case 1500×1500 = 9 tiles = 1615 tokens, typical 1000×750 = 4 tiles = 765 tokens
    // Using 1000 as reasonable upper estimate for compressed images
    const TOKENS_PER_IMAGE = 1000

    const countTokensJson = (obj: any): number => {
      // Very rough approximation
      return Math.ceil(JSON.stringify(obj).length / 3)
    }

    // Count tokens for a message, handling media content specially
    const countMessageTokens = (message: Message): number => {
      // For tool messages, check if content contains media type
      if (message.role === 'tool' && Array.isArray(message.content)) {
        let tokens = 0
        for (const part of message.content) {
          if (part.type === 'media') {
            // Use fixed token count for images since we compress them
            tokens += TOKENS_PER_IMAGE
          } else {
            tokens += countTokensJson(part)
          }
        }
        // Add overhead for message metadata
        tokens += countTokensJson({
          role: message.role,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
        })
        return tokens
      }

      // For user/assistant messages, check content array for images
      if (
        (message.role === 'user' || message.role === 'assistant') &&
        Array.isArray(message.content)
      ) {
        let tokens = 0
        for (const part of message.content) {
          if (part.type === 'image') {
            // Use fixed token count for images
            tokens += TOKENS_PER_IMAGE
          } else {
            tokens += countTokensJson(part)
          }
        }
        // Add overhead for message metadata
        tokens += countTokensJson({ role: message.role })
        return tokens
      }

      // Fallback to JSON-based counting
      return countTokensJson(message)
    }

    // Count tokens for an array of messages
    const countMessagesTokens = (msgs: Message[]): number => {
      return msgs.reduce((sum, msg) => sum + countMessageTokens(msg), 0)
    }

    // Account for system prompt and tool definition tokens when calculating effective message budget
    const systemPromptTokens: number = agentState.systemPrompt
      ? countTokensJson(agentState.systemPrompt)
      : 0
    const toolDefinitionTokens: number = agentState.toolDefinitions
      ? countTokensJson(agentState.toolDefinitions) * 0.75
      : 0
    const maxContextLength: number = params?.maxContextLength ?? 200_000
    const maxMessageTokens: number =
      maxContextLength - systemPromptTokens - toolDefinitionTokens
    const numTerminalCommandsToKeep = 5

    // Helper to extract tool call IDs from messages
    const extractToolCallIds = (msgs: Message[]): Set<string> => {
      const ids = new Set<string>()
      for (const message of msgs) {
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'tool-call' && part.toolCallId) {
              ids.add(part.toolCallId)
            }
          }
        }
      }
      return ids
    }

    // Helper to extract tool result IDs from messages
    const extractToolResultIds = (msgs: Message[]): Set<string> => {
      const ids = new Set<string>()
      for (const message of msgs) {
        if (message.role === 'tool' && message.toolCallId) {
          ids.add(message.toolCallId)
        }
      }
      return ids
    }

    // Helper to remove orphaned tool calls and results
    const removeOrphanedToolMessages = (msgs: Message[]): Message[] => {
      const toolCallIds = extractToolCallIds(msgs)
      const toolResultIds = extractToolResultIds(msgs)

      return msgs
        .filter((message) => {
          // Remove tool results without matching tool calls
          if (message.role === 'tool' && message.toolCallId) {
            return toolCallIds.has(message.toolCallId)
          }
          return true
        })
        .map((message) => {
          // Remove orphaned tool calls from assistant messages
          if (message.role === 'assistant' && Array.isArray(message.content)) {
            const filteredContent = message.content.filter((part: any) => {
              if (part.type === 'tool-call' && part.toolCallId) {
                return toolResultIds.has(part.toolCallId)
              }
              return true
            })
            // If all content was tool calls and all were removed, skip the message
            if (filteredContent.length === 0) {
              return null
            }
            if (filteredContent.length !== message.content.length) {
              return { ...message, content: filteredContent }
            }
          }
          return message
        })
        .filter((m): m is Message => m !== null)
    }

    // PASS 0: Remove last instructions prompt message.
    let currentMessages = [...messages]
    const lastInstructionsPromptIndex = currentMessages.findLastIndex(
      (message) => message.tags?.includes('INSTRUCTIONS_PROMPT'),
    )
    if (lastInstructionsPromptIndex !== -1) {
      currentMessages.splice(lastInstructionsPromptIndex, 1)
    }
    const lastSubagentSpawnIndex = currentMessages.findLastIndex((message) =>
      message.tags?.includes('SUBAGENT_SPAWN'),
    )
    if (lastSubagentSpawnIndex !== -1) {
      currentMessages.splice(lastSubagentSpawnIndex, 1)
    }

    // Initial check - if already under limit, return
    const initialTokens = countMessagesTokens(currentMessages)
    if (initialTokens < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: { messages: currentMessages },
        includeToolCall: false,
      }
      return
    }

    // PASS 1: Remove terminal command results (oldest first, preserve recent 5)
    // Only prune the tool result content, keeping the tool-call/tool-result pairs intact
    let numKeptTerminalCommands = 0
    const afterTerminalPass: Message[] = []

    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const message = currentMessages[i]

      // Handle tool messages with new object format
      if (
        message.role === 'tool' &&
        message.toolName === 'run_terminal_command'
      ) {
        const toolMessage =
          message as CodebuffToolMessage<'run_terminal_command'>

        if (numKeptTerminalCommands < numTerminalCommandsToKeep) {
          numKeptTerminalCommands++
          afterTerminalPass.unshift(message)
        } else {
          // Simplify terminal command result by replacing output content only
          const simplifiedMessage: CodebuffToolMessage<'run_terminal_command'> =
            {
              ...toolMessage,
              content: [
                {
                  type: 'json',
                  value: {
                    command: toolMessage.content[0]?.value?.command || '',
                    stdoutOmittedForLength: true,
                  },
                },
              ],
            }
          afterTerminalPass.unshift(simplifiedMessage)
        }
      } else {
        afterTerminalPass.unshift(message)
      }
    }

    // Check if terminal pass was enough
    const tokensAfterTerminal = countMessagesTokens(afterTerminalPass)
    if (tokensAfterTerminal < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: {
          messages: afterTerminalPass,
        },
        includeToolCall: false,
      }
      return
    }

    // PASS 2: Remove large tool results (any tool result output > 1000 chars when stringified)
    // Only prune the tool result content, keeping the tool-call/tool-result pairs intact
    const afterToolResultsPass = afterTerminalPass.map((message) => {
      if (message.role === 'tool') {
        const outputSize = JSON.stringify(message.content).length

        if (outputSize > 1000) {
          // Replace tool result content with simplified output
          const simplifiedMessage: ToolMessage = {
            ...message,
            content: [
              {
                type: 'json',
                value: {
                  message: '[LARGE_TOOL_RESULT_OMITTED]',
                  originalSize: outputSize,
                },
              },
            ],
          }
          return simplifiedMessage
        }
      }
      return message
    })

    // Check if tool results pass was enough
    const tokensAfterToolResults = countMessagesTokens(afterToolResultsPass)
    if (tokensAfterToolResults < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: {
          messages: afterToolResultsPass,
        },
        includeToolCall: false,
      } satisfies ToolCall<'set_messages'>
      return
    }

    // PASS 3: Message-level pruning
    // Must keep tool-call and tool-result pairs together for Anthropic API compliance
    const shortenedMessageTokenFactor = 0.5
    const replacementMessage: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '<system>Previous message(s) omitted due to length</system>',
        },
      ],
    }

    const keepLastTags: Record<string, number> = {}
    for (const [i, message] of afterToolResultsPass.entries()) {
      if (!message.keepLastTags) {
        continue
      }
      for (const tag of message.keepLastTags) {
        keepLastTags[tag] = i
      }
    }
    const keepLastIndices = Object.values(keepLastTags)

    // Build a map of toolCallId -> indices that must be kept together
    const toolCallPairs: Map<string, number[]> = new Map()
    for (const [i, message] of afterToolResultsPass.entries()) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'tool-call' && part.toolCallId) {
            const existing = toolCallPairs.get(part.toolCallId) || []
            existing.push(i)
            toolCallPairs.set(part.toolCallId, existing)
          }
        }
      } else if (message.role === 'tool' && message.toolCallId) {
        const existing = toolCallPairs.get(message.toolCallId) || []
        existing.push(i)
        toolCallPairs.set(message.toolCallId, existing)
      }
    }

    // Get all indices that are part of tool call pairs
    const pairedIndices = new Set<number>()
    for (const indices of toolCallPairs.values()) {
      for (const idx of indices) {
        pairedIndices.add(idx)
      }
    }

    const requiredTokens = countMessagesTokens(
      afterToolResultsPass.filter((m: any) => m.keepDuringTruncation),
    )
    let removedTokens = 0
    const tokensToRemove =
      (maxMessageTokens - requiredTokens) * (1 - shortenedMessageTokenFactor)

    const placeholder = 'deleted'
    const filteredMessages: any[] = []
    const indicesToRemove = new Set<number>()

    // First pass: identify which messages to remove (excluding tool call pairs)
    let lastWasRemoval = false
    for (const [i, message] of afterToolResultsPass.entries()) {
      if (
        removedTokens >= tokensToRemove ||
        message.keepDuringTruncation ||
        keepLastIndices.includes(i) ||
        pairedIndices.has(i) // Never remove tool-call/tool-result pairs
      ) {
        lastWasRemoval = false
        continue
      }
      indicesToRemove.add(i)
      removedTokens += countMessageTokens(message)
      // Account for placeholder token cost when starting a new removal sequence
      if (!lastWasRemoval) {
        removedTokens -= countMessageTokens(replacementMessage)
      }
      lastWasRemoval = true
    }

    // Second pass: build filtered messages with placeholders
    for (const [i, message] of afterToolResultsPass.entries()) {
      if (indicesToRemove.has(i)) {
        if (
          filteredMessages.length === 0 ||
          filteredMessages[filteredMessages.length - 1] !== placeholder
        ) {
          filteredMessages.push(placeholder)
        }
      } else {
        filteredMessages.push(message)
      }
    }

    const finalMessages = filteredMessages.map((m) =>
      m === placeholder ? replacementMessage : m,
    )

    // FINAL VALIDATION: Ensure all tool calls and results are properly paired
    const validatedMessages = removeOrphanedToolMessages(finalMessages)

    // Apply the final pruned message history
    yield {
      toolName: 'set_messages',
      input: {
        messages: validatedMessages,
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_messages'>
  },
}

export default definition
