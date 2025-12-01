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

  includeMessageHistory: true,

  handleSteps: function* ({ agentState, params }) {
    const messages = agentState.messageHistory

    const countTokensJson = (obj: any): number => {
      // Very rough approximation
      return Math.ceil(JSON.stringify(obj).length / 3)
    }

    const maxMessageTokens: number = params?.maxContextLength ?? 200_000
    const numTerminalCommandsToKeep = 5

    let currentMessages = [...messages]

    // Initial check - if already under limit, return
    const initialTokens = countTokensJson(currentMessages)
    if (initialTokens < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: { messages: currentMessages },
        includeToolCall: false,
      }
      return
    }

    // PASS 1: Remove terminal command results (oldest first, preserve recent 5)
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
          // Simplify terminal command result by replacing output
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
    const tokensAfterTerminal = countTokensJson(afterTerminalPass)
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
    const afterToolResultsPass = afterTerminalPass.map((message) => {
      if (message.role === 'tool') {
        const outputSize = JSON.stringify(message.content).length

        if (outputSize > 1000) {
          // Replace with simplified output
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
    const tokensAfterToolResults = countTokensJson(afterToolResultsPass)
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

    // PASS 3: Message-level pruning (like trimMessagesToFitTokenLimit)
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

    const requiredTokens = countTokensJson(
      afterToolResultsPass.filter((m: any) => m.keepDuringTruncation),
    )
    let removedTokens = 0
    const tokensToRemove =
      (maxMessageTokens - requiredTokens) * (1 - shortenedMessageTokenFactor)

    const placeholder = 'deleted'
    const filteredMessages: any[] = []

    for (const [i, message] of afterToolResultsPass.entries()) {
      if (
        removedTokens >= tokensToRemove ||
        message.keepDuringTruncation ||
        keepLastIndices.includes(i)
      ) {
        filteredMessages.push(message)
        continue
      }

      removedTokens += countTokensJson(message)
      if (
        filteredMessages.length === 0 ||
        filteredMessages[filteredMessages.length - 1] !== placeholder
      ) {
        filteredMessages.push(placeholder)
        removedTokens -= countTokensJson(replacementMessage)
      }
    }

    const finalMessages = filteredMessages.map((m) =>
      m === placeholder ? replacementMessage : m,
    )

    // Apply the final pruned message history
    yield {
      toolName: 'set_messages',
      input: {
        messages: finalMessages,
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_messages'>
  },
}

export default definition
