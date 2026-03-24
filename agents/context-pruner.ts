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
        assistantToolBudget: {
          type: 'number',
        },
        userBudget: {
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

    /** Agent IDs whose output should be excluded from spawn_agents results */
    const SPAWN_AGENTS_OUTPUT_BLACKLIST = [
      'file-picker',
      'researcher-web',
      'researcher-docs',
      'basher',
      'code-reviewer',
      'code-reviewer-multi-prompt',
      'librarian',
      'tmux-cli',
      'browser-use',
    ]

    /** Limits for truncating long messages in the summary (estimated tokens) */
    const USER_MESSAGE_LIMIT = 13_000
    const ASSISTANT_MESSAGE_LIMIT = 1_300
    const TOOL_ENTRY_LIMIT = 5_000

    /** Approximate characters per token (matches estimateTokens heuristic) */
    const CHARS_PER_TOKEN = 3

    /** Token budget for assistant + tool content in the conversation summary */
    const ASSISTANT_TOOL_BUDGET = 20_000

    /** Token budget for user content in the conversation summary */
    const USER_BUDGET = 50_000

    /** Fudge factor for token count threshold to trigger pruning earlier */
    const TOKEN_COUNT_FUDGE_FACTOR = 1_000

    /** Prompt cache expiry time (Anthropic caches for 5 minutes) */
    const CACHE_EXPIRY_MS = 5 * 60 * 1000

    /** Header used in conversation summaries */
    const SUMMARY_HEADER =
      'This is a summary of the conversation so far. The original messages have been condensed to save context space.'


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
          const pattern = input.pattern as string | undefined
          return pattern ? `Glob: ${pattern}` : 'Glob search'
        }
        case 'list_directory': {
          const path = input.path as string | undefined
          return path ? `Listed dir: ${path}` : 'Listed directory'
        }
        case 'find_files': {
          const prompt = input.prompt as string | undefined
          return prompt ? `Find files: "${prompt}"` : 'Find files'
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
          const libraryTitle = input.libraryTitle as string | undefined
          const topic = input.topic as string | undefined
          if (libraryTitle && topic) {
            return `Read docs: ${libraryTitle} - ${topic}`
          }
          return libraryTitle ? `Read docs: ${libraryTitle}` : 'Read docs'
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
    // 1. Summarize ALL messages (apply transformations: truncation, tool summaries, etc.)
    // 2. Walk backwards through summarized parts to apply token budgets
    // 3. Older summarized parts beyond the budgets are dropped

    const assistantToolBudget: number = params?.assistantToolBudget ?? ASSISTANT_TOOL_BUDGET
    const userBudget: number = params?.userBudget ?? USER_BUDGET

    function shouldExcludeMessage(message: Message): boolean {
      if (message.tags?.includes('INSTRUCTIONS_PROMPT')) return true
      if (message.tags?.includes('STEP_PROMPT')) return true
      if (message.tags?.includes('SUBAGENT_SPAWN')) return true
      return false
    }

    function isConversationSummary(message: Message): boolean {
      if (message.role !== 'user') return false
      return getTextContent(message).includes('<conversation_summary>')
    }

    function extractSummaryContent(message: Message): string {
      const text = getTextContent(message)
      const match = text.match(
        /<conversation_summary>([\s\S]*?)<\/conversation_summary>/,
      )
      if (!match) return ''
      let content = match[1].trim()
      if (content.startsWith(SUMMARY_HEADER)) {
        content = content.slice(SUMMARY_HEADER.length).trim()
      }
      return content
    }

    /**
     * Parses a previous summary text blob into role-tagged entries.
     * Splits on the --- separator and determines each chunk's role
     * based on its prefix marker.
     */
    function parseSummaryIntoEntries(
      summaryText: string,
    ): Array<{ role: 'user' | 'assistant_tool'; parts: string[] }> {
      if (!summaryText.trim()) return []

      const separator = '\n\n---\n\n'
      const chunks = summaryText.split(separator).filter((c) => c.trim())

      return chunks.map((chunk) => {
        const trimmed = chunk.trim()
        const isUser =
          trimmed.startsWith('[USER]\n') ||
          trimmed.startsWith('[USER] [with image')
        return {
          role: isUser ? ('user' as const) : ('assistant_tool' as const),
          parts: [trimmed],
        }
      })
    }

    // Extract previous summary content from all messages
    let previousSummaryContent = ''
    for (const message of currentMessages) {
      if (isConversationSummary(message)) {
        previousSummaryContent = extractSummaryContent(message)
      }
    }

    // Filter out excluded and conversation summary messages for summarization
    const messagesToSummarize = currentMessages.filter(
      (message) => !shouldExcludeMessage(message) && !isConversationSummary(message),
    )

    // Find the last user message with images to preserve in the final output
    let lastUserImageParts: Array<Record<string, unknown>> = []
    for (let i = messagesToSummarize.length - 1; i >= 0; i--) {
      const msg = messagesToSummarize[i]
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

    // Phase 1: Summarize ALL messages into tagged entries
    const summarizedEntries: Array<{ role: 'user' | 'assistant_tool'; parts: string[] }> = []

    for (const message of messagesToSummarize) {
      if (message.role === 'user') {
        let text = getTextContent(message).trim()
        if (text) {
          text = truncateLongText(text, USER_MESSAGE_LIMIT * CHARS_PER_TOKEN)
          let hasImages = false
          if (Array.isArray(message.content)) {
            hasImages = message.content.some(
              (part: Record<string, unknown>) =>
                part.type === 'image' || part.type === 'media',
            )
          }
          const imageNote = hasImages ? ' [with image(s)]' : ''
          summarizedEntries.push({
            role: 'user',
            parts: [`[USER]${imageNote}\n${text}`],
          })
        }
      } else if (message.role === 'assistant') {
        const textParts: string[] = []
        const toolSummaries: string[] = []

        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
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
          let combinedText = textParts.join('\n')
          combinedText = truncateLongText(combinedText, ASSISTANT_MESSAGE_LIMIT * CHARS_PER_TOKEN)
          parts.push(combinedText)
        }
        if (toolSummaries.length > 0) {
          parts.push(`Tools: ${toolSummaries.join('; ')}`)
        }

        if (parts.length > 0) {
          summarizedEntries.push({
            role: 'assistant_tool',
            parts: [`[ASSISTANT]\n${parts.join('\n')}`],
          })
        }
      } else if (message.role === 'tool') {
        const toolMessage = message as ToolMessage
        const entryParts: string[] = []

        if (Array.isArray(toolMessage.content)) {
          for (const part of toolMessage.content) {
            if (part.type === 'json' && part.value) {
              const value = part.value as Record<string, unknown>

              if (value.errorMessage || value.error) {
                let errorText = String(value.errorMessage || value.error)
                if (errorText.length > 100) {
                  errorText = errorText.slice(0, 100) + '...'
                }
                entryParts.push(
                  `[TOOL ERROR: ${toolMessage.toolName}] ${errorText}`,
                )
              }

              if (
                toolMessage.toolName === 'run_terminal_command' &&
                'exitCode' in value
              ) {
                const exitCode = value.exitCode as number
                if (exitCode !== 0) {
                  entryParts.push(`[COMMAND FAILED] Exit code: ${exitCode}`)
                }
              }

              if (toolMessage.toolName === 'ask_user') {
                if (value.skipped) {
                  entryParts.push('[USER SKIPPED QUESTION]')
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
                    const truncated =
                      answerTexts.length > 10_000
                        ? answerTexts.slice(0, 10_000) + '...'
                        : answerTexts
                    entryParts.push(`[USER ANSWERED] ${truncated}`)
                  }
                }
              }

              if (
                toolMessage.toolName === 'str_replace' ||
                toolMessage.toolName === 'propose_str_replace' ||
                toolMessage.toolName === 'write_file' ||
                toolMessage.toolName === 'propose_write_file'
              ) {
                const resultStr = JSON.stringify(value)
                const truncatedResult =
                  resultStr.length > 2000
                    ? resultStr.slice(0, 2000) + '...'
                    : resultStr
                entryParts.push(
                  `[EDIT RESULT: ${toolMessage.toolName}]\n${truncatedResult}`,
                )
              }
            }
          }
        }

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
                  if (r.value?.value !== undefined && r.value?.value !== null) {
                    if (typeof r.value.value === 'string') {
                      outputStr = r.value.value
                    } else {
                      outputStr = JSON.stringify(r.value.value)
                    }
                    outputStr = outputStr
                      .replace(/<think>[\s\S]*?<\/think>/g, '')
                      .trim()
                    if (outputStr.length > ASSISTANT_MESSAGE_LIMIT * CHARS_PER_TOKEN) {
                      outputStr =
                        outputStr.slice(0, ASSISTANT_MESSAGE_LIMIT * CHARS_PER_TOKEN) + '...'
                    }
                  }
                  return `- ${r.agentType}: ${outputStr || '(no output)'}`
                })
                entryParts.push(
                  `[AGENT RESULTS]\n${resultSummaries.join('\n')}`,
                )
              }
            }
          }
        }

        if (entryParts.length > 0) {
          const joinedToolEntry = truncateLongText(
            entryParts.join('\n\n'),
            TOOL_ENTRY_LIMIT * CHARS_PER_TOKEN,
          )
          summarizedEntries.push({
            role: 'assistant_tool',
            parts: [joinedToolEntry],
          })
        }
      }
    }

    // Parse previous summary into role-tagged entries and combine with new entries
    const allEntries = [
      ...parseSummaryIntoEntries(previousSummaryContent),
      ...summarizedEntries,
    ]

    // Phase 2: Walk backwards through all entries to apply token budgets
    let assistantToolTokens = 0
    let userTokens = 0
    let cutoffIndex = 0

    for (let i = allEntries.length - 1; i >= 0; i--) {
      const entry = allEntries[i]
      const entryText = entry.parts.join('\n\n---\n\n')
      const entryTokens = Math.ceil(entryText.length / CHARS_PER_TOKEN)

      if (entry.role === 'user') {
        if (userTokens + entryTokens > userBudget) {
          cutoffIndex = i + 1
          break
        }
        userTokens += entryTokens
      } else {
        if (assistantToolTokens + entryTokens > assistantToolBudget) {
          cutoffIndex = i + 1
          break
        }
        assistantToolTokens += entryTokens
      }
    }

    // Phase 3: Build final summary from included entries
    const summaryParts: string[] = []

    for (let i = cutoffIndex; i < allEntries.length; i++) {
      summaryParts.push(...allEntries[i].parts)
    }

    // Fallback: if nothing fit within budgets, always include at least the newest entry
    if (summaryParts.length === 0 && allEntries.length > 0) {
      summaryParts.push(...allEntries[allEntries.length - 1].parts)
    }

    const summaryText = summaryParts.join('\n\n---\n\n')

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
