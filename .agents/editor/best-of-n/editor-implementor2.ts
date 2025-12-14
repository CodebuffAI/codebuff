import { publisher } from '../../constants'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

export const createBestOfNImplementor2 = (options: {
  model: 'gpt-5' | 'opus' | 'sonnet'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isGpt5 = model === 'gpt-5'
  const isOpus = model === 'opus'
  return {
    publisher,
    model: isGpt5
      ? 'openai/gpt-5.2'
      : isOpus
        ? 'anthropic/claude-opus-4.5'
        : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5
      ? 'GPT-5 Implementation Generator v2'
      : isOpus
        ? 'Opus Implementation Generator v2'
        : 'Sonnet Implementation Generator v2',
    spawnerPrompt:
      'Generates a complete implementation using propose_* tools that draft changes without applying them',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['propose_write_file', 'propose_str_replace'],
    spawnableAgents: [],

    inputSchema: {},
    outputMode: 'structured_output',

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request.
    
Your task is to write out ALL the code changes needed to complete the user's request.

IMPORTANT: Use propose_str_replace and propose_write_file tools to make your edits. These tools draft changes without actually applying them - they will be reviewed first.

You can make multiple tool calls across multiple steps to complete the implementation.

After your edit tool calls, you can optionally mention any follow-up steps to take, like deleting a file, or a specific way to validate the changes.

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Be well-structured and organized

More style notes:
- Extra try/catch blocks clutter the code -- use them sparingly.
- Optional arguments are code smell and worse than required arguments.
- New components often should be added to a new file, not added to an existing file.

Write out your complete implementation now.`,

    handleSteps: function* ({ agentState: initialAgentState, logger }) {
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length

      const { agentState } = yield 'STEP_ALL'

      let postMessages = agentState.messageHistory.slice(
        initialMessageHistoryLength,
      )

      if (postMessages.length === 0) {
        const { agentState: postMessagesAgentState } = yield 'STEP'
        postMessages = postMessagesAgentState.messageHistory.slice(
          initialMessageHistoryLength,
        )
      } else if (postMessages.length == 1) {
        const message = postMessages[0]
        if (
          message.role === 'assistant' &&
          message.content.length === 1 &&
          message.content[0].type === 'text' &&
          !message.content[0].text
        ) {
          const { agentState: postMessagesAgentState } = yield 'STEP_ALL'
          postMessages = postMessagesAgentState.messageHistory.slice(
            initialMessageHistoryLength,
          )
        }
      }

      logger.debug(
        {
          numMessages: postMessages.length,
          messageRoles: postMessages.map((m: any) => m.role),
        },
        'Post STEP_ALL messages',
      )

      // Extract tool calls from assistant messages
      // Handle both 'input' and 'args' property names for compatibility
      const toolCalls: { toolName: string; input: any }[] = []
      for (const message of postMessages) {
        if (message.role !== 'assistant' || !Array.isArray(message.content))
          continue
        for (const part of message.content) {
          if (part.type === 'tool-call') {
            toolCalls.push({
              toolName: part.toolName,
              input: part.input ?? (part as any).args ?? {},
            })
          }
        }
      }

      // Extract tool results (unified diffs) from tool messages
      const toolResults: any[] = []
      for (const message of postMessages) {
        if (message.role !== 'tool' || !Array.isArray(message.content)) continue
        for (const part of message.content) {
          if (part.type === 'json' && part.value) {
            toolResults.push(part.value)
          }
        }
      }

      logger.debug(
        { numToolCalls: toolCalls.length, numToolResults: toolResults.length },
        'Extracted tool calls and results',
      )

      // Concatenate all unified diffs for the selector to review
      const unifiedDiffs = toolResults
        .filter((result: any) => result.unifiedDiff)
        .map((result: any) => `--- ${result.file} ---\n${result.unifiedDiff}`)
        .join('\n\n')

      logger.debug(
        {
          unifiedDiffsLength: unifiedDiffs.length,
          hasContent: unifiedDiffs.length > 0,
        },
        'Generated unified diffs',
      )

      yield {
        toolName: 'set_output',
        input: {
          toolCalls,
          toolResults,
          unifiedDiffs,
        },
        includeToolCall: false,
      }
    },
  }
}
const definition = {
  ...createBestOfNImplementor2({ model: 'opus' }),
  id: 'editor-implementor2',
}
export default definition
