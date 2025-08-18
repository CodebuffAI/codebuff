import { publisher } from './constants'

import type { AgentDefinition, Message } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'context-pruner',
  publisher,
  displayName: 'Context Pruner',
  model: 'openai/gpt-5-mini',

  toolNames: ['set_messages'],

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

    // Remove the last assistant message if it contains the spawn call that invoked this context-pruner
    let currentMessages = [...messages]
    if (currentMessages.length > 0) {
      const lastMessage = currentMessages[currentMessages.length - 1]
      if (
        lastMessage.role === 'assistant' &&
        typeof lastMessage.content === 'string'
      ) {
        // Check if this message contains a spawn_agent_inline call for context-pruner
        if (
          lastMessage.content.includes('spawn_agent_inline') &&
          lastMessage.content.includes('context-pruner')
        ) {
          // Remove the entire message
          currentMessages.pop()
        }
      }
    }

    // Initial check - if already under limit, return (with inline agent tool call removed)
    const initialTokens = countTokensJson(currentMessages)
    if (initialTokens < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: {
          messages: currentMessages,
        },
      }
      return
    }

    // PASS 1: Remove terminal command results (oldest first, preserve recent 5)
    let numKeptTerminalCommands = 0
    const afterTerminalPass: Message[] = []

    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const message = currentMessages[i]
      let processedContent =
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content)

      if (processedContent.includes('<tool>run_terminal_command</tool>')) {
        if (numKeptTerminalCommands < numTerminalCommandsToKeep) {
          numKeptTerminalCommands++
          afterTerminalPass.unshift({ ...message, content: processedContent })
        } else {
          // Simplify terminal command result
          processedContent = processedContent.replace(
            /<tool_result>\s*<tool>run_terminal_command<\/tool>\s*<result>[\s\S]*?<\/result>\s*<\/tool_result>/g,
            '<tool_result><tool>run_terminal_command</tool><result>[Output omitted]</result></tool_result>',
          )
          afterTerminalPass.unshift({ ...message, content: processedContent })
        }
      } else {
        afterTerminalPass.unshift({ ...message, content: processedContent })
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
      }
      return
    }

    // PASS 2: Remove large tool results (any tool result > 1000 chars)
    const afterToolResultsPass: Message[] = afterTerminalPass.map((message) => {
      let processedContent =
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content)

      if (
        processedContent.includes('<tool_result>') &&
        processedContent.length > 1000
      ) {
        processedContent = processedContent.replace(
          /<result>[\s\S]*?<\/result>/g,
          '<result>[Large tool result omitted]</result>',
        )
      }

      return { ...message, content: processedContent }
    })

    // Check if tool results pass was enough
    const tokensAfterToolResults = countTokensJson(afterToolResultsPass)
    if (tokensAfterToolResults < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: {
          messages: afterToolResultsPass,
        },
      }
      return
    }

    // PASS 3: Message-level pruning (like trimMessagesToFitTokenLimit)
    const shortenedMessageTokenFactor = 0.5
    const replacementMessage: Message = {
      role: 'user',
      content: '<system>Previous message(s) omitted due to length</system>',
    }

    const requiredTokens = countTokensJson(
      afterToolResultsPass.filter((m: any) => m.keepDuringTruncation),
    )
    let removedTokens = 0
    const tokensToRemove =
      (maxMessageTokens - requiredTokens) * (1 - shortenedMessageTokenFactor)

    const placeholder = 'deleted'
    const filteredMessages: (Message | typeof placeholder)[] = []

    for (const message of afterToolResultsPass) {
      if (
        removedTokens >= tokensToRemove ||
        (message as any).keepDuringTruncation
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
    }
  },
}

export default definition
