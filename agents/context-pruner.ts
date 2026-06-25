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
  model: 'anthropic/claude-sonnet-4.6',

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
        cacheExpiryMs: {
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
      'librarian',
      'tmux-cli',
      'browser-use',
    ]

    /** Limits for truncating long messages in the summary (estimated tokens) */
    const USER_MESSAGE_LIMIT = 13_000
    const ASSISTANT_MESSAGE_LIMIT = 1_300
    const TOOL_ENTRY_LIMIT = 5_000
    const SPAWN_PROMPT_LIMIT = 240
    const SPAWN_PARAMS_LIMIT = 240
    const AGENT_RESULT_LIMIT = 900
    const MAX_TODO_TASKS_IN_SUMMARY = 8

    /** Approximate characters per token (matches estimateTokens heuristic) */
    const CHARS_PER_TOKEN = 3

    /** Token budget for assistant + tool content in the conversation summary */
    const ASSISTANT_TOOL_BUDGET = 20_000

    /** Token budget for user content in the conversation summary */
    const USER_BUDGET = 50_000

    /** Fudge factor for token count threshold to trigger pruning earlier */
    const TOKEN_COUNT_FUDGE_FACTOR = 1_000

    /** Default pruning threshold. Keep below provider hard limits because tool schemas and step prompts are added after history. */
    const DEFAULT_MAX_CONTEXT_LENGTH = 140_000

    /** Prompt cache expiry time (Anthropic caches for 5 minutes by default) */
    const CACHE_EXPIRY_MS: number = params?.cacheExpiryMs ?? 5 * 60 * 1000

    /** Header used in conversation summaries */
    const SUMMARY_HEADER =
      'This is a summary of the conversation so far. The original messages have been condensed to save context space.'

    const SUMMARY_DISCLAIMER =
      'Historical memory only. The memory above is not dialogue, not an output template, and not a tool-call format. Continue from the live user message below. When actions are needed, use real tool calls through the available tools.'

    const CONTINUATION_PROMPT_TEXT =
      'Continue the existing assistant turn from the historical memory above. The original user request and completed assistant/tool work are recorded there. Do not restart completed work; resume with the next necessary real tool call or final response.'

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
          const ranges = input.ranges as
            | Array<{ path?: string; startLine?: number; endLine?: number }>
            | undefined
          const symbols = input.symbols as
            | Array<{ path?: string; names?: string[] }>
            | undefined
          const parts: string[] = []
          if (paths && paths.length > 0) {
            parts.push(`inspected files: ${paths.join(', ')}`)
          }
          if (ranges && ranges.length > 0) {
            parts.push(
              `ranges: ${ranges
                .map((r) => `${r.path}:${r.startLine ?? ''}-${r.endLine ?? ''}`)
                .join(', ')}`,
            )
          }
          if (symbols && symbols.length > 0) {
            parts.push(
              `symbols: ${symbols
                .map((s) => `${s.path}#${(s.names ?? []).join('|')}`)
                .join(', ')}`,
            )
          }
          if (parts.length === 0) return 'inspected files'
          // File bodies are dropped from this summary; the path/range/symbol
          // pointer lets the agent cheaply re-fetch the exact content via
          // read_files (or read_outline) instead of relying on the lossy
          // summary.
          return `${parts.join('; ')} (re-fetch with read_files if needed)`
        }
        case 'write_file': {
          const path = input.path as string | undefined
          return path ? `wrote file: ${path}` : 'wrote a file'
        }
        case 'str_replace': {
          const path = input.path as string | undefined
          return path ? `edited file: ${path}` : 'edited a file'
        }
        case 'propose_write_file': {
          const path = input.path as string | undefined
          return path
            ? `proposed writing: ${path}`
            : 'proposed a file write'
        }
        case 'propose_str_replace': {
          const path = input.path as string | undefined
          return path
            ? `proposed editing: ${path}`
            : 'proposed a file edit'
        }
        case 'read_subtree': {
          const paths = input.paths as string[] | undefined
          if (paths && paths.length > 0) {
            return `inspected subtrees: ${paths.join(', ')}`
          }
          return 'inspected a subtree'
        }
        case 'code_search': {
          const pattern = input.pattern as string | undefined
          const flags = input.flags as string | undefined
          if (pattern && flags) {
            return `code search for "${pattern}" (${flags})`
          }
          return pattern
            ? `code search for "${pattern}"`
            : 'code search'
        }
        case 'glob': {
          const pattern = input.pattern as string | undefined
          return pattern
            ? `glob search for ${pattern}`
            : 'glob search'
        }
        case 'list_directory': {
          const path = input.path as string | undefined
          return path
            ? `listed directory: ${path}`
            : 'listed a directory'
        }
        case 'find_files': {
          const prompt = input.prompt as string | undefined
          return prompt
            ? `file-finding request: "${prompt}"`
            : 'file-finding request'
        }
        case 'run_terminal_command': {
          const command = input.command as string | undefined
          if (command) {
            const shortCmd =
              command.length > 50 ? command.slice(0, 50) + '...' : command
            return `ran command: ${shortCmd}`
          }
          return 'ran a terminal command'
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
                  a.prompt.length > SPAWN_PROMPT_LIMIT
                    ? a.prompt.slice(0, SPAWN_PROMPT_LIMIT) + '...'
                    : a.prompt
                extras.push(`prompt: "${truncatedPrompt}"`)
              }
              if (a.params && Object.keys(a.params).length > 0) {
                const paramsStr = JSON.stringify(a.params)
                const truncatedParams =
                  paramsStr.length > SPAWN_PARAMS_LIMIT
                    ? paramsStr.slice(0, SPAWN_PARAMS_LIMIT) + '...'
                    : paramsStr
                extras.push(`params: ${truncatedParams}`)
              }
              if (extras.length > 0) {
                detail += ` (${extras.join(', ')})`
              }
              return detail
            })
            return `delegated agents:\n${agentDetails.map((d) => `- ${d}`).join('\n')}`
          }
          if (agentType) {
            const extras: string[] = []
            if (prompt) {
              const truncatedPrompt =
                prompt.length > SPAWN_PROMPT_LIMIT
                  ? prompt.slice(0, SPAWN_PROMPT_LIMIT) + '...'
                  : prompt
              extras.push(`prompt: "${truncatedPrompt}"`)
            }
            if (agentParams && Object.keys(agentParams).length > 0) {
              const paramsStr = JSON.stringify(agentParams)
              const truncatedParams =
                paramsStr.length > SPAWN_PARAMS_LIMIT
                  ? paramsStr.slice(0, SPAWN_PARAMS_LIMIT) + '...'
                  : paramsStr
              extras.push(`params: ${truncatedParams}`)
            }
            if (extras.length > 0) {
              return `delegated agent ${agentType} (${extras.join(', ')})`
            }
            return `delegated agent ${agentType}`
          }
          return 'delegated agent work'
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
            const visibleIncomplete = incomplete.slice(0, MAX_TODO_TASKS_IN_SUMMARY)
            const remainingTasks = visibleIncomplete
              .map((t) => `- ${t.task}`)
              .join('\n')
            const omittedCount = incomplete.length - visibleIncomplete.length
            const omittedNote =
              omittedCount > 0 ? `\n- ...${omittedCount} more not shown` : ''
            return `Todos: ${completed}/${todos.length} complete. Remaining:\n${remainingTasks}${omittedNote}`
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
          const url = input.url as string | undefined
          const query = input.query as string | undefined
          if (url) return `web fetch: ${url}`
          return query ? `web search for "${query}"` : 'web search'
        }
        case 'read_docs': {
          const libraryTitle = input.libraryTitle as string | undefined
          const topic = input.topic as string | undefined
          if (libraryTitle && topic) {
            return `consulted docs: ${libraryTitle} - ${topic}`
          }
          return libraryTitle
            ? `consulted docs: ${libraryTitle}`
            : 'consulted docs'
        }
        case 'set_output':
          return 'set structured output'
        case 'set_messages':
          return 'updated message history'
        default:
          return `used tool ${toolName}`
      }
    }

    // =============================================================================
    // Main Logic
    // =============================================================================

    const messages = agentState.messageHistory
    const maxContextLength: number =
      params?.maxContextLength ?? DEFAULT_MAX_CONTEXT_LENGTH

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

    // Also remove the params USER_PROMPT if params were provided to this agent
    // (this is the message like <user_message>{"cacheExpiryMs": 600000}</user_message>)
    if (params && Object.keys(params).length > 0) {
      const lastUserPromptIndex = currentMessages.findLastIndex((message) =>
        message.tags?.includes('USER_PROMPT'),
      )
      if (lastUserPromptIndex !== -1) {
        currentMessages.splice(lastUserPromptIndex, 1)
      }
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
    if (
      agentState.contextTokenCount + TOKEN_COUNT_FUDGE_FACTOR <=
        maxContextLength &&
      !cacheWillMiss
    ) {
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

    const assistantToolBudget: number =
      params?.assistantToolBudget ?? ASSISTANT_TOOL_BUDGET
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
      const memoryMatch = content.match(
        /<historical_memory>([\s\S]*?)<\/historical_memory>/,
      )
      if (memoryMatch) {
        content = memoryMatch[1].trim()
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

      const withoutPinnedState = summaryText
        .replace(
          /<pinned_active_work_state>[\s\S]*?<\/pinned_active_work_state>\n*/g,
          '',
        )
        .trim()
      if (!withoutPinnedState) return []

      const separator = '\n\n---\n\n'
      const chunks = withoutPinnedState.split(separator).filter((c) => c.trim())

      return chunks.map((chunk) => {
        const trimmed = sanitizeOperationalStateText(chunk.trim())
        const isUser =
          trimmed.startsWith('[USER]') ||
          trimmed.startsWith('User request') ||
          trimmed.startsWith('User message') ||
          trimmed.startsWith('Current unresolved user request')
        return {
          role: isUser ? ('user' as const) : ('assistant_tool' as const),
          parts: [trimmed],
        }
      })
    }

    function addUniqueLine(lines: string[], line: string): void {
      const trimmed = line.trim()
      if (trimmed && !lines.includes(trimmed)) {
        lines.push(trimmed)
      }
    }

    function extractPinnedActiveWorkState(text: string): string[] {
      const pinned: string[] = []
      for (const match of text.matchAll(
        /<pinned_active_work_state>([\s\S]*?)<\/pinned_active_work_state>/g,
      )) {
        const lines = extractActiveWorkLines(match[1])
        for (const line of lines) {
          addUniqueLine(pinned, line)
        }
      }
      return pinned
    }

    function extractActiveWorkLines(text: string): string[] {
      const pinned: string[] = []
      let isInFinalResponseAllowedState = false
      let finalResponseAllowedPhaseLine = ''
      let workflowTodoLines: string[] = []
      let workflowTodoHasNextAction = false

      function flushWorkflowTodoLines(): void {
        if (workflowTodoLines.length > 0 && workflowTodoHasNextAction) {
          if (finalResponseAllowedPhaseLine) {
            addUniqueLine(pinned, finalResponseAllowedPhaseLine)
          }
          for (const workflowLine of workflowTodoLines) {
            addUniqueLine(pinned, workflowLine)
          }
        }
        workflowTodoLines = []
        workflowTodoHasNextAction = false
      }

      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) {
          flushWorkflowTodoLines()
          continue
        }

        if (/^Workflow todo progress \(authoritative resumable state\):/i.test(trimmed)) {
          flushWorkflowTodoLines()
          workflowTodoLines = [trimmed]
          workflowTodoHasNextAction = false
          continue
        }

        if (workflowTodoLines.length > 0) {
          if (/^Completed \d+\/\d+\./i.test(trimmed)) {
            workflowTodoLines.push(trimmed)
            continue
          }
          const nextActionMatch = trimmed.match(/^Next workflow action:\s*(.+)$/i)
          if (nextActionMatch) {
            workflowTodoLines.push(trimmed)
            workflowTodoHasNextAction = nextActionMatch[1].trim().length > 0
            continue
          }
          if (/^Continue from this item;/i.test(trimmed)) {
            workflowTodoLines.push(trimmed)
            continue
          }
          flushWorkflowTodoLines()
        }

        const phaseMatch = trimmed.match(/^Current phase:\s*(\S+)/i)
        if (phaseMatch) {
          isInFinalResponseAllowedState =
            phaseMatch[1].toLowerCase() === 'final_response_allowed'
          if (isInFinalResponseAllowedState) {
            finalResponseAllowedPhaseLine = trimmed
          } else {
            finalResponseAllowedPhaseLine = ''
            addUniqueLine(pinned, trimmed)
          }
          continue
        }

        if (/^BLOCKING:/i.test(trimmed)) {
          addUniqueLine(pinned, trimmed)
          continue
        }

        // Pin plan-declared blocking open questions (e.g. "Open questions (block Milestone 4)")
        // verbatim, plus their Q\d sub-bullets, so a resuming agent sees the controlling
        // fact without re-reading STATUS.md.
        if (/^Open questions?\s*\(block/i.test(trimmed)) {
          addUniqueLine(pinned, trimmed)
          continue
        }

        if (/^[-*]\s*Q\d+\b\s*[:\u2014-]/i.test(trimmed)) {
          addUniqueLine(pinned, trimmed)
          continue
        }

        if (isInFinalResponseAllowedState) continue

        if (
          /^(Harness pinned active-work state|Open reviewer blockers\/feedback|Pending validation\/reviewer gate files:|Last validation summary:|Next required action:)/i.test(
            trimmed,
          )
        ) {
          addUniqueLine(pinned, trimmed)
        }
      }
      flushWorkflowTodoLines()
      return pinned
    }

    function sanitizeOperationalStateText(text: string): string {
      const withoutPinnedState = text.replace(
        /<pinned_active_work_state>[\s\S]*?<\/pinned_active_work_state>\n*/g,
        '',
      )
      const withoutSystemReminders = withoutPinnedState.replace(
        /<system_reminder>[\s\S]*?<\/system_reminder>\n*/g,
        '',
      )
      if (withoutSystemReminders.trim() === CONTINUATION_PROMPT_TEXT) {
        return ''
      }
      const sanitizedLines: string[] = []
      let skippingTodoList = false
      let skippingWorkflowTodoProgress = false

      for (const line of withoutSystemReminders.split('\n')) {
        const trimmed = line.trim()
        const isWorkflowTodoProgressLine =
          /^Workflow todo progress \(authoritative resumable state\):/i.test(
            trimmed,
          ) ||
          /^Completed \d+\/\d+\./i.test(trimmed) ||
          /^Next workflow action:/i.test(trimmed) ||
          /^Continue from this item;/i.test(trimmed)
        const isOperationalLine =
          /^(Harness pinned active-work state|Open reviewer blockers\/feedback|Current phase:|Pending validation\/reviewer gate files:|Historical changed files:|Historical touched files:|Latest work summary:|Last validation summary:|Next required action:|Todos:|Remaining:)/i.test(
            trimmed,
          ) ||
          /^(BLOCKING|NON_BLOCKING):/i.test(trimmed) ||
          /^Open questions?\s*\(block/i.test(trimmed) ||
          /^[-*]\s*Q\d+\b\s*[:\u2014-]/i.test(trimmed)

        if (/^Workflow todo progress \(authoritative resumable state\):/i.test(trimmed)) {
          skippingTodoList = false
          skippingWorkflowTodoProgress = true
          continue
        }

        if (skippingWorkflowTodoProgress) {
          if (!trimmed || isWorkflowTodoProgressLine) {
            continue
          }
          skippingWorkflowTodoProgress = false
        }

        if (/^(Todos:|Remaining:)/i.test(trimmed)) {
          skippingTodoList = true
          continue
        }

        if (isOperationalLine) {
          skippingTodoList = false
          continue
        }

        if (skippingTodoList) {
          if (!trimmed || /^[-*•☐✓]/.test(trimmed)) {
            continue
          }
          skippingTodoList = false
        }

        sanitizedLines.push(line)
      }

      return sanitizedLines.join('\n').trim()
    }

    // Extract previous summary content from all messages
    let previousSummaryContent = ''
    for (const message of currentMessages) {
      if (isConversationSummary(message)) {
        previousSummaryContent = extractSummaryContent(message)
      }
    }

    // If pruning happens before the assistant has started responding to the
    // current user prompt, preserve that prompt as a real message after the
    // memory artifact. If pruning happens mid-turn, keep the prompt in the
    // historical memory with the assistant/tool progress that followed it and
    // append a synthetic continuation prompt instead.
    const latestLiveUserPromptIndex = currentMessages.findLastIndex((message) =>
      message.tags?.includes('USER_PROMPT'),
    )
    const latestLiveUserPromptMessage =
      latestLiveUserPromptIndex !== -1
        ? currentMessages[latestLiveUserPromptIndex]
        : null
    const isMidTurnPrune =
      latestLiveUserPromptIndex !== -1 &&
      currentMessages
        .slice(latestLiveUserPromptIndex + 1)
        .some(
          (message) =>
            !shouldExcludeMessage(message) && !isConversationSummary(message),
        )

    // Filter out excluded, conversation summary, and live-prompt messages for summarization
    const messagesToSummarize = currentMessages
      .filter(
        (_message, index) =>
          isMidTurnPrune || index !== latestLiveUserPromptIndex,
      )
      .filter(
        (message) =>
          !shouldExcludeMessage(message) && !isConversationSummary(message),
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
    const summarizedEntries: Array<{
      role: 'user' | 'assistant_tool'
      parts: string[]
    }> = []
    const pinnedActiveWorkLines = extractPinnedActiveWorkState(
      previousSummaryContent,
    )

    for (const message of messagesToSummarize) {
      if (message.role === 'user') {
        let text = getTextContent(message).trim()
        if (text) {
          for (const line of extractActiveWorkLines(text)) {
            addUniqueLine(pinnedActiveWorkLines, line)
          }
          text = sanitizeOperationalStateText(text)
          if (!text) continue
          text = truncateLongText(text, USER_MESSAGE_LIMIT * CHARS_PER_TOKEN)
          let hasImages = false
          if (Array.isArray(message.content)) {
            hasImages = message.content.some(
              (part: Record<string, unknown>) =>
                part.type === 'image' || part.type === 'media',
            )
          }
          const imageNote = hasImages ? ' [image(s) were attached]' : ''
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
              const rawTextWithoutThinkTags = (part.text as string).replace(
                /<think>[\s\S]*?<\/think>/g,
                '',
              )
              for (const line of extractActiveWorkLines(rawTextWithoutThinkTags)) {
                addUniqueLine(pinnedActiveWorkLines, line)
              }
              const textWithoutThinkTags = sanitizeOperationalStateText(
                rawTextWithoutThinkTags,
              )
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
          combinedText = truncateLongText(
            combinedText,
            ASSISTANT_MESSAGE_LIMIT * CHARS_PER_TOKEN,
          )
          parts.push(`Progress note:\n${combinedText}`)
        }
        if (toolSummaries.length > 0) {
          parts.push(toolSummaries.join('\n'))
        }

        if (parts.length > 0) {
          summarizedEntries.push({
            role: 'assistant_tool',
            parts,
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
                  `Tool error from ${toolMessage.toolName}: ${errorText}`,
                )
              }

              if (
                toolMessage.toolName === 'run_terminal_command' &&
                'exitCode' in value
              ) {
                const exitCode = value.exitCode as number
                if (exitCode !== 0) {
                  entryParts.push(`Command failed with exit code: ${exitCode}`)
                }
              }

              if (toolMessage.toolName === 'ask_user') {
                if (value.skipped) {
                  entryParts.push('User skipped question')
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
                    entryParts.push(`User answered: ${truncated}`)
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
                  `Edit result from ${toolMessage.toolName}:\n${truncatedResult}`,
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
                    if (
                      outputStr.length >
                      AGENT_RESULT_LIMIT * CHARS_PER_TOKEN
                    ) {
                      outputStr =
                        outputStr.slice(
                          0,
                          AGENT_RESULT_LIMIT * CHARS_PER_TOKEN,
                        ) + '...'
                    }
                  }
                  return `- ${r.agentType}: ${outputStr || '(no output)'}`
                })
                entryParts.push(`Agent results:\n${resultSummaries.join('\n')}`)
              }
            }
          }
        }

        if (entryParts.length > 0) {
          const joinedToolEntry = truncateLongText(
            entryParts.join('\n\n'),
            TOOL_ENTRY_LIMIT * CHARS_PER_TOKEN,
          )
          for (const line of extractActiveWorkLines(joinedToolEntry)) {
            addUniqueLine(pinnedActiveWorkLines, line)
          }
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
    const hasSubstantivePinnedActiveWork = pinnedActiveWorkLines.some(
      (line) =>
        !/^(Harness pinned active-work state|Open reviewer blockers\/feedback|Last validation summary:)/i.test(
          line,
        ),
    )
    if (hasSubstantivePinnedActiveWork) {
      summaryParts.push(
        [
          '<pinned_active_work_state>',
          'Pinned active-work/reviewer state. Preserve verbatim across compaction; this section is not subject to normal budget cutoff.',
          ...pinnedActiveWorkLines,
          '</pinned_active_work_state>',
        ].join('\n'),
      )
    }

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
${SUMMARY_HEADER}

<historical_memory>
${summaryText}
</historical_memory>
</conversation_summary>

${SUMMARY_DISCLAIMER}`,
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

    const continuationMessage: UserMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: CONTINUATION_PROMPT_TEXT,
        },
      ],
      sentAt: now,
    }

    // Build final messages array: summary first, then INSTRUCTIONS_PROMPT if it
    // exists, then either the live user prompt or a mid-turn continuation prompt.
    // Keeping a real user message last makes the next model step continue from
    // normal user input instead of the condensed memory format.
    const finalMessages: Message[] = [summarizedMessage]
    if (instructionsPromptMessage) {
      // Update sentAt to current time so future cache miss checks use fresh timestamps
      finalMessages.push({ ...instructionsPromptMessage, sentAt: now })
    }
    if (isMidTurnPrune) {
      finalMessages.push(continuationMessage)
    } else if (latestLiveUserPromptMessage) {
      finalMessages.push({ ...latestLiveUserPromptMessage, sentAt: now })
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
