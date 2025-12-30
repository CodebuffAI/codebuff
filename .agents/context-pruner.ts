import { publisher } from './constants'

import type { AgentDefinition, ToolCall } from './types/agent-definition'
import type { Message, ToolMessage } from './types/util-types'

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

    // Tools that should be preserved during aggressive pruning
    // These are essential for understanding file state and task progress
    const IMPORTANT_TOOLS = new Set([
      'read_files',
      'write_todos',
      'write_file',
      'str_replace',
      'propose_write_file',
      'propose_str_replace',
    ])

    // Threshold for truncating large tool results (chars)
    const LARGE_TOOL_RESULT_THRESHOLD = 1000

    // Number of recent messages to protect from non-important tool removal
    const KEEP_LAST_N_MESSAGES = 30

    // Target token factor (25% of max = aggressive trimming)
    const TARGET_TOKEN_FACTOR = 0.25

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
      // For messages with images/media, we need special handling to avoid counting base64 data
      if (Array.isArray(message.content)) {
        // Check if there are any images or media
        const hasImagesOrMedia = message.content.some(
          (part: any) => part.type === 'image' || part.type === 'media',
        )

        if (hasImagesOrMedia) {
          let tokens = 0

          // Count content parts, handling images specially
          for (const part of message.content) {
            if (part.type === 'image' || part.type === 'media') {
              tokens += TOKENS_PER_IMAGE
            } else {
              tokens += countTokensJson(part)
            }
          }

          // Count the rest of the message fields (role, toolCallId, toolName, tags, etc.)
          const { content, ...rest } = message
          tokens += countTokensJson(rest)

          return tokens
        }
      }

      // No images/media, just count the whole message
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

    // Helper to build tool call pair info from messages
    // Returns a map of toolCallId -> { callIndex, resultIndex, toolName }
    const buildToolPairMap = (
      msgs: Message[],
    ): Map<
      string,
      { callIndex: number; resultIndex: number; toolName: string }
    > => {
      const pairs = new Map<
        string,
        { callIndex: number; resultIndex: number; toolName: string }
      >()

      for (const [i, message] of msgs.entries()) {
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'tool-call' && part.toolCallId) {
              const existing = pairs.get(part.toolCallId) || {
                callIndex: -1,
                resultIndex: -1,
                toolName: part.toolName || '',
              }
              existing.callIndex = i
              existing.toolName = part.toolName || ''
              pairs.set(part.toolCallId, existing)
            }
          }
        } else if (message.role === 'tool' && message.toolCallId) {
          const existing = pairs.get(message.toolCallId) || {
            callIndex: -1,
            resultIndex: -1,
            toolName: message.toolName || '',
          }
          existing.resultIndex = i
          if (!existing.toolName) {
            existing.toolName = message.toolName || ''
          }
          pairs.set(message.toolCallId, existing)
        }
      }

      return pairs
    }

    // Helper to get all indices that are part of tool call pairs
    const getPairedIndices = (msgs: Message[]): Set<number> => {
      const pairs = buildToolPairMap(msgs)
      const indices = new Set<number>()
      for (const { callIndex, resultIndex } of pairs.values()) {
        if (callIndex >= 0) indices.add(callIndex)
        if (resultIndex >= 0) indices.add(resultIndex)
      }
      return indices
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

    // Initial check - if already under limit, return early (skip all pruning)
    const initialTokens = countMessagesTokens(currentMessages)
    if (initialTokens < maxMessageTokens) {
      yield {
        toolName: 'set_messages',
        input: { messages: currentMessages },
        includeToolCall: false,
      }
      return
    }

    // PASS 1: Truncate large tool results
    // Only prune the tool result content, keeping the tool-call/tool-result pairs intact
    const afterPass1 = currentMessages.map((message) => {
      if (message.role === 'tool') {
        const outputSize = JSON.stringify(message.content).length

        if (outputSize > LARGE_TOOL_RESULT_THRESHOLD) {
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

    // PASS 2: Remove non-important tool call pairs that aren't in the last N messages
    // Always run to clean up old tool calls that aren't essential
    let afterPass2: Message[] = afterPass1
    {
      const lastNStartIndex = Math.max(
        0,
        afterPass1.length - KEEP_LAST_N_MESSAGES,
      )
      const toolPairs = buildToolPairMap(afterPass1)

      // Identify indices of non-important tool pairs to remove
      // Remove pairs where:
      // 1. Tool is not in IMPORTANT_TOOLS list
      // 2. Both call and result are NOT in the last N messages
      const indicesToRemovePass2 = new Set<number>()
      for (const { callIndex, resultIndex, toolName } of toolPairs.values()) {
        // Check if this tool pair is in the last N messages
        const isInLastN =
          (callIndex >= 0 && callIndex >= lastNStartIndex) ||
          (resultIndex >= 0 && resultIndex >= lastNStartIndex)

        // Remove if not important AND not in last N messages
        if (!IMPORTANT_TOOLS.has(toolName) && !isInLastN) {
          if (callIndex >= 0) indicesToRemovePass2.add(callIndex)
          if (resultIndex >= 0) indicesToRemovePass2.add(resultIndex)
        }
      }

      // Rebuild messages without the removed indices
      if (indicesToRemovePass2.size > 0) {
        afterPass2 = afterPass1.filter((_, i) => !indicesToRemovePass2.has(i))
      }
    }

    // PASS 3: Message-level pruning (more severe)
    // Preserves: user messages, tool-call/tool-result pairs
    // Target 25% of max tokens for aggressive trimming
    const replacementMessage: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '<system>Previous message(s) omitted due to length</system>',
        },
      ],
    }

    const tokensAfterPass2 = countMessagesTokens(afterPass2)
    let afterPass3: Message[] = afterPass2

    // Get all indices that are part of tool call pairs
    const pairedIndices = getPairedIndices(afterPass2)

    // Calculate how much we need to remove to get to target (25% of limit)
    // If already under target, tokensToRemove will be non-positive and loop won't remove anything
    const targetTokens = maxMessageTokens * TARGET_TOKEN_FACTOR
    const tokensToRemove = tokensAfterPass2 - targetTokens

    let removedTokens = 0
    const indicesToRemove = new Set<number>()

    // Identify which messages to remove (oldest first)
    // Preserve: user messages, tool call pairs
    for (const [i, message] of afterPass2.entries()) {
      if (removedTokens >= tokensToRemove) {
        break
      }
      // Never remove user messages or tool call pairs
      if (message.role === 'user' || pairedIndices.has(i)) {
        continue
      }
      indicesToRemove.add(i)
      removedTokens += countMessageTokens(message)
    }

    // Build filtered messages with a single placeholder at the front
    if (indicesToRemove.size > 0) {
      afterPass3 = [
        replacementMessage,
        ...afterPass2.filter((_, i) => !indicesToRemove.has(i)),
      ]
    }

    // PASS 4: Most aggressive - remove ALL messages from front until under 25% target
    // This is the last resort when even PASS 3 couldn't get us under the limit
    let afterPass4: Message[] = afterPass3
    const tokensAfterPass3 = countMessagesTokens(afterPass3)

    if (tokensAfterPass3 > targetTokens) {
      let currentTokens = tokensAfterPass3
      let startIndex = 0

      // Remove messages from the front until under target
      while (currentTokens > targetTokens && startIndex < afterPass3.length) {
        currentTokens -= countMessageTokens(afterPass3[startIndex])
        startIndex++
      }

      // Keep messages from startIndex onwards, prepend a placeholder
      if (startIndex > 0) {
        afterPass4 = [replacementMessage, ...afterPass3.slice(startIndex)]
      }
    }

    // FINAL VALIDATION: Ensure all tool calls and results are properly paired
    const validatedMessages = removeOrphanedToolMessages(afterPass4)

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
