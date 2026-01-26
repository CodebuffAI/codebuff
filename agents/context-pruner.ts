import { publisher } from './constants'

import type { AgentDefinition, ToolCall } from './types/agent-definition'
import type {
  FilePart,
  ImagePart,
  Message,
  TextPart,
  ToolMessage,
  UserMessage,
} from './types/util-types'

// =============================================================================
// Helper Functions (exported for testing)
// =============================================================================

/**
 * Truncates long text with 80% from the beginning and 20% from the end.
 * Preserves context from both ends of the text while indicating what was removed.
 *
 * @param text - The text to truncate
 * @param limit - Maximum character length
 * @returns Truncated text with notice of how many chars were removed
 */
export function truncateLongText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }
  const availableChars = limit - 50 // 50 chars for the truncation notice
  const prefixLength = Math.floor(availableChars * 0.8)
  const suffixLength = availableChars - prefixLength
  const prefix = text.slice(0, prefixLength)
  const suffix = text.slice(-suffixLength)
  const truncatedChars = text.length - prefixLength - suffixLength
  return `${prefix}\n\n[...truncated ${truncatedChars} chars...]\n\n${suffix}`
}

/**
 * Estimates token count from a JSON-serializable object.
 * Uses a simple heuristic of ~3 characters per token.
 *
 * @param obj - The object to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / 3)
}

/**
 * Extracts text content from a message, handling both string and array formats.
 *
 * @param message - The message to extract text from
 * @returns Combined text content from the message
 */
export function getTextContent(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter(
        (part: Record<string, unknown>) =>
          part.type === 'text' && typeof part.text === 'string',
      )
      .map((part: Record<string, unknown>) => part.text as string)
      .join('\n')
  }
  return ''
}

/**
 * Summarizes a tool call into a human-readable description.
 * Handles various tool types with appropriate formatting.
 *
 * @param toolName - The name of the tool
 * @param input - The tool's input parameters
 * @returns A concise summary of the tool call
 */
export function summarizeToolCall(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'read_files': {
      const paths = input.paths as string[] | undefined
      if (paths && paths.length > 0) {
        return `Read files: ${paths.join(', ')}`
      }
      return 'Read files'
    }
    case 'write_file': {
      const path = input.path as string | undefined
      return path ? `Wrote file: ${path}` : 'Wrote file'
    }
    case 'str_replace': {
      const path = input.path as string | undefined
      return path ? `Edited file: ${path}` : 'Edited file'
    }
    case 'propose_write_file': {
      const path = input.path as string | undefined
      return path ? `Proposed write to: ${path}` : 'Proposed file write'
    }
    case 'propose_str_replace': {
      const path = input.path as string | undefined
      return path ? `Proposed edit to: ${path}` : 'Proposed file edit'
    }
    case 'read_subtree': {
      const paths = input.paths as string[] | undefined
      if (paths && paths.length > 0) {
        return `Read subtree: ${paths.join(', ')}`
      }
      return 'Read subtree'
    }
    case 'code_search': {
      const pattern = input.pattern as string | undefined
      const flags = input.flags as string | undefined
      if (pattern && flags) {
        return `Code search: "${pattern}" (${flags})`
      }
      return pattern ? `Code search: "${pattern}"` : 'Code search'
    }
    case 'glob': {
      const patterns = input.patterns as
        | Array<{ pattern: string }>
        | undefined
      if (patterns && patterns.length > 0) {
        return `Glob: ${patterns.map((p) => p.pattern).join(', ')}`
      }
      return 'Glob search'
    }
    case 'list_directory': {
      const directories = input.directories as
        | Array<{ path: string }>
        | undefined
      if (directories && directories.length > 0) {
        return `Listed dirs: ${directories.map((d) => d.path).join(', ')}`
      }
      return 'Listed directory'
    }
    case 'find_files': {
      const pattern = input.pattern as string | undefined
      return pattern ? `Find files: "${pattern}"` : 'Find files'
    }
    case 'run_terminal_command': {
      const command = input.command as string | undefined
      if (command) {
        const shortCmd =
          command.length > 50 ? command.slice(0, 50) + '...' : command
        return `Ran command: ${shortCmd}`
      }
      return 'Ran terminal command'
    }
    case 'spawn_agents':
    case 'spawn_agent_inline': {
      const agents = input.agents as
        | Array<{
            agent_type: string
            prompt?: string
            params?: Record<string, unknown>
          }>
        | undefined
      const agentType = input.agent_type as string | undefined
      const prompt = input.prompt as string | undefined
      const agentParams = input.params as
        | Record<string, unknown>
        | undefined

      if (agents && agents.length > 0) {
        const agentDetails = agents.map((a) => {
          let detail = a.agent_type
          const extras: string[] = []
          if (a.prompt) {
            const truncatedPrompt =
              a.prompt.length > 1000
                ? a.prompt.slice(0, 1000) + '...'
                : a.prompt
            extras.push(`prompt: "${truncatedPrompt}"`)
          }
          if (a.params && Object.keys(a.params).length > 0) {
            const paramsStr = JSON.stringify(a.params)
            const truncatedParams =
              paramsStr.length > 1000
                ? paramsStr.slice(0, 1000) + '...'
                : paramsStr
            extras.push(`params: ${truncatedParams}`)
          }
          if (extras.length > 0) {
            detail += ` (${extras.join(', ')})`
          }
          return detail
        })
        return `Spawned agents:\n${agentDetails.map((d) => `- ${d}`).join('\n')}`
      }
      if (agentType) {
        const extras: string[] = []
        if (prompt) {
          const truncatedPrompt =
            prompt.length > 1000 ? prompt.slice(0, 1000) + '...' : prompt
          extras.push(`prompt: "${truncatedPrompt}"`)
        }
        if (agentParams && Object.keys(agentParams).length > 0) {
          const paramsStr = JSON.stringify(agentParams)
          const truncatedParams =
            paramsStr.length > 1000
              ? paramsStr.slice(0, 1000) + '...'
              : paramsStr
          extras.push(`params: ${truncatedParams}`)
        }
        if (extras.length > 0) {
          return `Spawned agent: ${agentType} (${extras.join(', ')})`
        }
        return `Spawned agent: ${agentType}`
      }
      return 'Spawned agent(s)'
    }
    case 'write_todos': {
      const todos = input.todos as
        | Array<{ task: string; completed: boolean }>
        | undefined
      if (todos) {
        const completed = todos.filter((t) => t.completed).length
        const incomplete = todos.filter((t) => !t.completed)
        if (incomplete.length === 0) {
          return `Todos: ${completed}/${todos.length} complete (all done!)`
        }
        const remainingTasks = incomplete
          .map((t) => `- ${t.task}`)
          .join('\n')
        return `Todos: ${completed}/${todos.length} complete. Remaining:\n${remainingTasks}`
      }
      return 'Updated todos'
    }
    case 'ask_user': {
      const questions = input.questions as
        | Array<{ question: string }>
        | undefined
      if (questions && questions.length > 0) {
        const questionTexts = questions.map((q) => q.question).join('; ')
        const truncated =
          questionTexts.length > 200
            ? questionTexts.slice(0, 200) + '...'
            : questionTexts
        return `Asked user: ${truncated}`
      }
      return 'Asked user question'
    }
    case 'suggest_followups':
      return 'Suggested followups'
    case 'web_search': {
      const query = input.query as string | undefined
      return query ? `Web search: "${query}"` : 'Web search'
    }
    case 'read_docs': {
      const query = input.query as string | undefined
      return query ? `Read docs: "${query}"` : 'Read docs'
    }
    case 'set_output':
      return 'Set output'
    case 'set_messages':
      return 'Set messages'
    default:
      return `Used tool: ${toolName}`
  }
}

const definition: AgentDefinition = {
  id: 'context-pruner',
  publisher,
  displayName: 'Context Pruner',
  model: 'openai/gpt-5-mini',

  spawnerPrompt: `Spawn this agent between steps to prune context, summarizing the conversation into a condensed format when context exceeds the limit.`,

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

  handleSteps: function* ({ agentState, params }) {
    // =============================================================================
    // Constants (must be inside handleSteps since it's serialized to a string)
    // =============================================================================

    /** Target: summarized messages should be at most 10% of max context */
    const TARGET_SUMMARY_FACTOR = 0.1

    /** Agent IDs whose output should be excluded from spawn_agents results */
    const SPAWN_AGENTS_OUTPUT_BLACKLIST = [
      'file-picker',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'researcher-web',
      'researcher-docs',
      'commander',
      'commander-lite',
      'code-reviewer',
      'code-reviewer-multi-prompt',
    ]

    /** Limits for truncating long messages (chars) */
    const USER_MESSAGE_LIMIT = 15000
    const ASSISTANT_MESSAGE_LIMIT = 4000

    /** Prompt cache expiry time (Anthropic caches for 5 minutes) */
    const CACHE_EXPIRY_MS = 5 * 60 * 1000

    /** Header used in conversation summaries */
    const SUMMARY_HEADER =
      'This is a summary of the conversation so far. The original messages have been condensed to save context space.'

    /** Fudge factor for token count threshold to trigger pruning earlier */
    const TOKEN_COUNT_FUDGE_FACTOR = 1000

    // =============================================================================
    // Helper Functions (must be inside handleSteps since it's serialized to a string)
    // =============================================================================

    /**
     * Truncates long text with 80% from the beginning and 20% from the end.
     */
    function truncateLongText(text: string, limit: number): string {
      if (text.length <= limit) {
        return text
      }
      const availableChars = limit - 50 // 50 chars for the truncation notice
      const prefixLength = Math.floor(availableChars * 0.8)
      const suffixLength = availableChars - prefixLength
      const prefix = text.slice(0, prefixLength)
      const suffix = text.slice(-suffixLength)
      const truncatedChars = text.length - prefixLength - suffixLength
      return `${prefix}\n\n[...truncated ${truncatedChars} chars...]\n\n${suffix}`
    }

    /**
     * Estimates token count from a JSON-serializable object.
     */
    function estimateTokens(obj: unknown): number {
      return Math.ceil(JSON.stringify(obj).length / 3)
    }

    /**
     * Extracts text content from a message.
     */
    function getTextContent(message: Message): string {
      if (typeof message.content === 'string') {
        return message.content
      }
      if (Array.isArray(message.content)) {
        return message.content
          .filter(
            (part: Record<string, unknown>) =>
              part.type === 'text' && typeof part.text === 'string',
          )
          .map((part: Record<string, unknown>) => part.text as string)
          .join('\n')
      }
      return ''
    }

    /**
     * Summarizes a tool call into a human-readable description.
     */
    function summarizeToolCall(
      toolName: string,
      input: Record<string, unknown>,
    ): string {
      switch (toolName) {
        case 'read_files': {
          const paths = input.paths as string[] | undefined
          if (paths && paths.length > 0) {
            return `Read files: ${paths.join(', ')}`
          }
          return 'Read files'
        }
        case 'write_file': {
          const path = input.path as string | undefined
          return path ? `Wrote file: ${path}` : 'Wrote file'
        }
        case 'str_replace': {
          const path = input.path as string | undefined
          return path ? `Edited file: ${path}` : 'Edited file'
        }
        case 'propose_write_file': {
          const path = input.path as string | undefined
          return path ? `Proposed write to: ${path}` : 'Proposed file write'
        }
        case 'propose_str_replace': {
          const path = input.path as string | undefined
          return path ? `Proposed edit to: ${path}` : 'Proposed file edit'
        }
        case 'read_subtree': {
          const paths = input.paths as string[] | undefined
          if (paths && paths.length > 0) {
            return `Read subtree: ${paths.join(', ')}`
          }
          return 'Read subtree'
        }
        case 'code_search': {
          const pattern = input.pattern as string | undefined
          const flags = input.flags as string | undefined
          if (pattern && flags) {
            return `Code search: "${pattern}" (${flags})`
          }
          return pattern ? `Code search: "${pattern}"` : 'Code search'
        }
        case 'glob': {
          const patterns = input.patterns as
            | Array<{ pattern: string }>
            | undefined
          if (patterns && patterns.length > 0) {
            return `Glob: ${patterns.map((p) => p.pattern).join(', ')}`
          }
          return 'Glob search'
        }
        case 'list_directory': {
          const directories = input.directories as
            | Array<{ path: string }>
            | undefined
          if (directories && directories.length > 0) {
            return `Listed dirs: ${directories.map((d) => d.path).join(', ')}`
          }
          return 'Listed directory'
        }
        case 'find_files': {
          const pattern = input.pattern as string | undefined
          return pattern ? `Find files: "${pattern}"` : 'Find files'
        }
        case 'run_terminal_command': {
          const command = input.command as string | undefined
          if (command) {
            const shortCmd =
              command.length > 50 ? command.slice(0, 50) + '...' : command
            return `Ran command: ${shortCmd}`
          }
          return 'Ran terminal command'
        }
        case 'spawn_agents':
        case 'spawn_agent_inline': {
          const agents = input.agents as
            | Array<{
                agent_type: string
                prompt?: string
                params?: Record<string, unknown>
              }>
            | undefined
          const agentType = input.agent_type as string | undefined
          const prompt = input.prompt as string | undefined
          const agentParams = input.params as
            | Record<string, unknown>
            | undefined

          if (agents && agents.length > 0) {
            const agentDetails = agents.map((a) => {
              let detail = a.agent_type
              const extras: string[] = []
              if (a.prompt) {
                const truncatedPrompt =
                  a.prompt.length > 1000
                    ? a.prompt.slice(0, 1000) + '...'
                    : a.prompt
                extras.push(`prompt: "${truncatedPrompt}"`)
              }
              if (a.params && Object.keys(a.params).length > 0) {
                const paramsStr = JSON.stringify(a.params)
                const truncatedParams =
                  paramsStr.length > 1000
                    ? paramsStr.slice(0, 1000) + '...'
                    : paramsStr
                extras.push(`params: ${truncatedParams}`)
              }
              if (extras.length > 0) {
                detail += ` (${extras.join(', ')})`
              }
              return detail
            })
            return `Spawned agents:\n${agentDetails.map((d) => `- ${d}`).join('\n')}`
          }
          if (agentType) {
            const extras: string[] = []
            if (prompt) {
              const truncatedPrompt =
                prompt.length > 1000 ? prompt.slice(0, 1000) + '...' : prompt
              extras.push(`prompt: "${truncatedPrompt}"`)
            }
            if (agentParams && Object.keys(agentParams).length > 0) {
              const paramsStr = JSON.stringify(agentParams)
              const truncatedParams =
                paramsStr.length > 1000
                  ? paramsStr.slice(0, 1000) + '...'
                  : paramsStr
              extras.push(`params: ${truncatedParams}`)
            }
            if (extras.length > 0) {
              return `Spawned agent: ${agentType} (${extras.join(', ')})`
            }
            return `Spawned agent: ${agentType}`
          }
          return 'Spawned agent(s)'
        }
        case 'write_todos': {
          const todos = input.todos as
            | Array<{ task: string; completed: boolean }>
            | undefined
          if (todos) {
            const completed = todos.filter((t) => t.completed).length
            const incomplete = todos.filter((t) => !t.completed)
            if (incomplete.length === 0) {
              return `Todos: ${completed}/${todos.length} complete (all done!)`
            }
            const remainingTasks = incomplete
              .map((t) => `- ${t.task}`)
              .join('\n')
            return `Todos: ${completed}/${todos.length} complete. Remaining:\n${remainingTasks}`
          }
          return 'Updated todos'
        }
        case 'ask_user': {
          const questions = input.questions as
            | Array<{ question: string }>
            | undefined
          if (questions && questions.length > 0) {
            const questionTexts = questions.map((q) => q.question).join('; ')
            const truncated =
              questionTexts.length > 200
                ? questionTexts.slice(0, 200) + '...'
                : questionTexts
            return `Asked user: ${truncated}`
          }
          return 'Asked user question'
        }
        case 'suggest_followups':
          return 'Suggested followups'
        case 'web_search': {
          const query = input.query as string | undefined
          return query ? `Web search: "${query}"` : 'Web search'
        }
        case 'read_docs': {
          const query = input.query as string | undefined
          return query ? `Read docs: "${query}"` : 'Read docs'
        }
        case 'set_output':
          return 'Set output'
        case 'set_messages':
          return 'Set messages'
        default:
          return `Used tool: ${toolName}`
      }
    }

    // =============================================================================
    // Main Logic
    // =============================================================================

    const messages = agentState.messageHistory
    const maxContextLength: number = params?.maxContextLength ?? 200_000

    // STEP 0: Always remove the last INSTRUCTIONS_PROMPT and SUBAGENT_SPAWN
    // (these are inserted for the context-pruner subagent itself)
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

    // Check for prompt cache miss (>5 min gap before the USER_PROMPT message)
    // The USER_PROMPT is the actual user message; INSTRUCTIONS_PROMPT comes after it
    // We need to find the USER_PROMPT and check the gap between it and the last assistant message
    let cacheWillMiss = false
    const userPromptIndex = currentMessages.findLastIndex((message) =>
      message.tags?.includes('USER_PROMPT'),
    )
    if (userPromptIndex > 0) {
      const userPromptMsg = currentMessages[userPromptIndex]
      // Find the last assistant message before USER_PROMPT (tool messages don't have sentAt)
      let lastAssistantMsg: Message | undefined
      for (let i = userPromptIndex - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'assistant') {
          lastAssistantMsg = currentMessages[i]
          break
        }
      }
      if (userPromptMsg.sentAt && lastAssistantMsg?.sentAt) {
        const gap = userPromptMsg.sentAt - lastAssistantMsg.sentAt
        cacheWillMiss = gap > CACHE_EXPIRY_MS
      }
    }

    // Check if we need to prune at all:
    // - Prune when context exceeds max, OR
    // - Prune when prompt cache will miss (>5 min gap) to take advantage of fresh context
    // If not, return messages with just the subagent-specific tags removed
    if (agentState.contextTokenCount + TOKEN_COUNT_FUDGE_FACTOR <= maxContextLength && !cacheWillMiss) {
      yield {
        toolName: 'set_messages',
        input: { messages: currentMessages },
        includeToolCall: false,
      }
      return
    }

    // === SUMMARIZATION MODE ===
    // Find and extract the last remaining INSTRUCTIONS_PROMPT message (for the parent agent)
    // to be preserved as the second message after the summary
    let instructionsPromptMessage: Message | null = null
    const lastRemainingInstructionsIndex = currentMessages.findLastIndex(
      (message) => message.tags?.includes('INSTRUCTIONS_PROMPT'),
    )
    if (lastRemainingInstructionsIndex !== -1) {
      instructionsPromptMessage =
        currentMessages[lastRemainingInstructionsIndex]
      currentMessages.splice(lastRemainingInstructionsIndex, 1)
    }

    // === SUMMARIZATION STRATEGY ===
    // Convert entire conversation to a single summarized user message
    // If there's already a summary from a previous compaction, extract and preserve it

    // Check for existing conversation summary and extract its content
    let previousSummary = ''
    for (const message of currentMessages) {
      if (message.role === 'user' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            const text = part.text as string
            const summaryMatch = text.match(
              /<conversation_summary>([\s\S]*?)<\/conversation_summary>/,
            )
            if (summaryMatch) {
              let summaryContent = summaryMatch[1].trim()
              // Remove the standard header if present
              if (summaryContent.startsWith(SUMMARY_HEADER)) {
                summaryContent = summaryContent
                  .slice(SUMMARY_HEADER.length)
                  .trim()
              }
              // Remove [PREVIOUS SUMMARY] prefix if present (from earlier compaction)
              // to avoid nested markers
              if (summaryContent.startsWith('[PREVIOUS SUMMARY]')) {
                summaryContent = summaryContent
                  .slice('[PREVIOUS SUMMARY]'.length)
                  .trim()
              }
              previousSummary = summaryContent
            }
          }
        }
      }
    }

    // Filter out messages that are previous summaries or have special tags to exclude
    const messagesWithoutOldSummaries = currentMessages.filter((message) => {
      // Exclude messages with special tags that shouldn't be in the summary
      if (message.tags?.includes('INSTRUCTIONS_PROMPT')) return false
      if (message.tags?.includes('STEP_PROMPT')) return false
      if (message.tags?.includes('SUBAGENT_SPAWN')) return false

      // Exclude previous conversation summaries
      if (message.role === 'user' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            if ((part.text as string).includes('<conversation_summary>')) {
              return false
            }
          }
        }
      }
      return true
    })

    // Build the summary
    const summaryParts: string[] = []

    // Find the last user message with images to preserve in the final output
    // We preserve the most recent user's images since they're likely the most relevant
    let lastUserImageParts: Array<Record<string, unknown>> = []
    for (let i = messagesWithoutOldSummaries.length - 1; i >= 0; i--) {
      const msg = messagesWithoutOldSummaries[i]
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const imageParts = msg.content.filter(
          (part: Record<string, unknown>) =>
            part.type === 'image' || part.type === 'media',
        )
        if (imageParts.length > 0) {
          lastUserImageParts = imageParts
          break
        }
      }
    }

    // If there was a previous summary, include it first (no marker needed, already chronological)
    if (previousSummary) {
      summaryParts.push(previousSummary)
    }

    for (const message of messagesWithoutOldSummaries) {
      if (message.role === 'user') {
        let text = getTextContent(message).trim()
        if (text) {
          // Truncate very long user messages (80% prefix, 20% suffix)
          text = truncateLongText(text, USER_MESSAGE_LIMIT)
          // Check for images in the message
          let hasImages = false
          if (Array.isArray(message.content)) {
            hasImages = message.content.some(
              (part: Record<string, unknown>) =>
                part.type === 'image' || part.type === 'media',
            )
          }
          const imageNote = hasImages ? ' [with image(s)]' : ''
          summaryParts.push(`[USER]${imageNote}\n${text}`)
        }
      } else if (message.role === 'assistant') {
        const textParts: string[] = []
        const toolSummaries: string[] = []

        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
              // Remove <think> tags and their contents before summarizing
              const textWithoutThinkTags = (part.text as string)
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .trim()
              if (textWithoutThinkTags) {
                textParts.push(textWithoutThinkTags)
              }
            } else if (part.type === 'tool-call') {
              const toolName = part.toolName as string
              const input = (part.input as Record<string, unknown>) || {}
              toolSummaries.push(summarizeToolCall(toolName, input))
            }
          }
        }

        const parts: string[] = []
        if (textParts.length > 0) {
          // Truncate very long assistant text (80% prefix, 20% suffix)
          let combinedText = textParts.join('\n')
          combinedText = truncateLongText(combinedText, ASSISTANT_MESSAGE_LIMIT)
          parts.push(combinedText)
        }
        if (toolSummaries.length > 0) {
          parts.push(`Tools: ${toolSummaries.join('; ')}`)
        }

        if (parts.length > 0) {
          summaryParts.push(`[ASSISTANT]\n${parts.join('\n')}`)
        }
      } else if (message.role === 'tool') {
        // Tool results are already captured via the tool-call summaries
        // But we capture errors, terminal exit codes, and ask_user answers
        const toolMessage = message as ToolMessage
        if (Array.isArray(toolMessage.content)) {
          for (const part of toolMessage.content) {
            if (part.type === 'json' && part.value) {
              const value = part.value as Record<string, unknown>

              // Capture errors
              if (value.errorMessage || value.error) {
                let errorText = String(value.errorMessage || value.error)
                // Truncate long error messages to 100 chars
                if (errorText.length > 100) {
                  errorText = errorText.slice(0, 100) + '...'
                }
                summaryParts.push(
                  `[TOOL ERROR: ${toolMessage.toolName}] ${errorText}`,
                )
              }

              // Capture terminal command exit codes (non-zero = failure)
              if (
                toolMessage.toolName === 'run_terminal_command' &&
                'exitCode' in value
              ) {
                const exitCode = value.exitCode as number
                if (exitCode !== 0) {
                  summaryParts.push(`[COMMAND FAILED] Exit code: ${exitCode}`)
                }
              }

              // Capture ask_user answers or skipped
              if (toolMessage.toolName === 'ask_user') {
                if (value.skipped) {
                  summaryParts.push('[USER SKIPPED QUESTION]')
                } else if ('answers' in value) {
                  const answers = value.answers as
                    | Array<{
                        selectedOption?: string
                        selectedOptions?: string[]
                        otherText?: string
                      }>
                    | undefined
                  if (answers && answers.length > 0) {
                    const answerTexts = answers
                      .map((a) => {
                        if (a.otherText) return a.otherText
                        if (a.selectedOptions)
                          return a.selectedOptions.join(', ')
                        if (a.selectedOption) return a.selectedOption
                        return '(no answer)'
                      })
                      .join('; ')
                    // Truncate long answers to 10,000 chars
                    const truncated =
                      answerTexts.length > 10_000
                        ? answerTexts.slice(0, 10_000) + '...'
                        : answerTexts
                    summaryParts.push(`[USER ANSWERED] ${truncated}`)
                  }
                }
              }

              // Capture str_replace results (diff of changes made)
              if (toolMessage.toolName === 'str_replace') {
                const diff = value.diff as string | undefined
                if (diff) {
                  // Truncate long diffs to 2000 chars
                  const truncatedDiff =
                    diff.length > 2000 ? diff.slice(0, 2000) + '...' : diff
                  summaryParts.push(`[EDIT RESULT]\n${truncatedDiff}`)
                }
              }

              // Capture write_file results (diff of changes made)
              if (toolMessage.toolName === 'write_file') {
                const diff = value.diff as string | undefined
                if (diff) {
                  // Truncate long diffs to 2000 chars
                  const truncatedDiff =
                    diff.length > 2000 ? diff.slice(0, 2000) + '...' : diff
                  summaryParts.push(`[WRITE RESULT]\n${truncatedDiff}`)
                }
              }
            }
          }
        }

        // Capture spawn_agents results (excluding blacklisted agents)
        // The tool result value is an array of agent results at the top level
        if (
          toolMessage.toolName === 'spawn_agents' &&
          Array.isArray(toolMessage.content)
        ) {
          for (const part of toolMessage.content) {
            if (part.type === 'json' && Array.isArray(part.value)) {
              const agentResults = part.value as Array<{
                agentName?: string
                agentType?: string
                value?: {
                  type?: string
                  value?: unknown
                }
              }>
              const includedResults = agentResults.filter(
                (r) =>
                  r.agentType &&
                  !SPAWN_AGENTS_OUTPUT_BLACKLIST.includes(r.agentType),
              )
              if (includedResults.length > 0) {
                const resultSummaries = includedResults.map((r) => {
                  let outputStr = ''
                  // Extract the actual output from value.value (e.g., lastMessage content)
                  if (r.value?.value !== undefined && r.value?.value !== null) {
                    if (typeof r.value.value === 'string') {
                      outputStr = r.value.value
                    } else {
                      outputStr = JSON.stringify(r.value.value)
                    }
                    // Remove <think> tags and their contents to save context tokens
                    outputStr = outputStr
                      .replace(/<think>[\s\S]*?<\/think>/g, '')
                      .trim()
                    // Truncate long outputs to ASSISTANT_MESSAGE_LIMIT chars
                    if (outputStr.length > ASSISTANT_MESSAGE_LIMIT) {
                      outputStr =
                        outputStr.slice(0, ASSISTANT_MESSAGE_LIMIT) + '...'
                    }
                  }
                  return `- ${r.agentType}: ${outputStr || '(no output)'}`
                })
                summaryParts.push(
                  `[AGENT RESULTS]\n${resultSummaries.join('\n')}`,
                )
              }
            }
          }
        }
      }
    }

    let summaryText = summaryParts.join('\n\n---\n\n')

    // Calculate target size (10% of max context, for messages only)
    const targetTokens = maxContextLength * TARGET_SUMMARY_FACTOR
    let summaryTokens = estimateTokens(summaryText)

    // If summary is too big, truncate from the beginning
    if (summaryTokens > targetTokens) {
      const truncationMessage =
        '[CONVERSATION TRUNCATED - Earlier messages omitted due to length]\n\n'
      const truncationTokens = estimateTokens(truncationMessage)
      const availableTokens = targetTokens - truncationTokens

      // Estimate characters to keep (rough: 3 chars per token)
      const charsToKeep = Math.floor(availableTokens * 3)

      if (charsToKeep > 0 && charsToKeep < summaryText.length) {
        // Truncate from the beginning, try to find a clean break point
        const truncatedText = summaryText.slice(-charsToKeep)
        // Find the first separator to make a clean cut
        const separatorIndex = truncatedText.indexOf('\n\n---\n\n')
        if (
          separatorIndex !== -1 &&
          separatorIndex < truncatedText.length / 2
        ) {
          summaryText =
            truncationMessage +
            truncatedText.slice(separatorIndex + '\n\n---\n\n'.length)
        } else {
          summaryText = truncationMessage + truncatedText
        }
      } else if (charsToKeep <= 0) {
        summaryText =
          truncationMessage + '[Summary too large - content omitted]'
      }
    }

    // Create the summarized message with fresh sentAt timestamp
    // Include any images from the last user message that had images
    const now = Date.now()
    const textPart: TextPart = {
      type: 'text',
      text: `<conversation_summary>
This is a summary of the conversation so far. The original messages have been condensed to save context space.

${summaryText}
</conversation_summary>

Please continue the conversation from here. In particular, try to address the user's latest request detailed in the summary above. You may need to re-gather context (e.g. read some files) to get up to speed and then tackle the user's request.`,
    }
    // Build content array with text and any preserved images
    const summaryContentParts: (TextPart | ImagePart | FilePart)[] = [textPart]
    // Append image parts (they're already typed correctly from the original message)
    for (const part of lastUserImageParts) {
      summaryContentParts.push(part as ImagePart | FilePart)
    }
    const summarizedMessage: UserMessage = {
      role: 'user',
      content: summaryContentParts,
      sentAt: now,
    }

    // Build final messages array: summary first, then INSTRUCTIONS_PROMPT if it exists
    const finalMessages: Message[] = [summarizedMessage]
    if (instructionsPromptMessage) {
      // Update sentAt to current time so future cache miss checks use fresh timestamps
      finalMessages.push({ ...instructionsPromptMessage, sentAt: now })
    }

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
