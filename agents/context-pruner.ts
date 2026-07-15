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
        toolFactsBudget: {
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
  messageHistoryMode: 'full',
  propagateMessageHistoryChanges: true,

  handleSteps: function* ({ agentState, params }) {
    // =============================================================================
    // Constants (must be inside handleSteps since it's serialized to a string)
    // =============================================================================

    /** Agent IDs whose output should be excluded from spawn_agents results */
    const SPAWN_AGENTS_OUTPUT_BLACKLIST = [
      'file-picker',
      'code-reviewer',
      'security-reviewer',
    ]
    const REVIEWER_AGENT_TYPES = ['code-reviewer', 'security-reviewer']

    /** Limits for truncating long messages in the summary (estimated tokens) */
    const USER_MESSAGE_LIMIT = 13_000
    const ASSISTANT_MESSAGE_LIMIT = 1_300
    const TOOL_ENTRY_LIMIT = 5_000
    const SPAWN_PROMPT_LIMIT = 240
    const SPAWN_PARAMS_LIMIT = 240
    const AGENT_RESULT_LIMIT = 900
    const REVIEWER_RESULT_LIMIT = 1_200
    const MAX_TODO_TASKS_IN_SUMMARY = 8

    /** Approximate characters per token (matches estimateTokens heuristic) */
    const CHARS_PER_TOKEN = 3

    /**
     * Share of the model-aware summary target reserved for assistant text and
     * tool-call summaries. Tool results are tracked separately.
     */
    const ASSISTANT_TOOL_BUDGET_FRACTION = 0.4

    /**
     * Share reserved for user content. User goals are also protected in the
     * structured <knowledge_memory> block, reducing reliance on free text.
     */
    const USER_BUDGET_FRACTION = 0.3

    /**
     * Share reserved for tool-result entries ("facts learned from tools"),
     * independent of conversational role. Operational memory therefore does
     * not compete with assistant text or user text.
     */
    const TOOL_FACTS_BUDGET_FRACTION = 0.3

    /** Fudge factor for token count threshold to trigger pruning earlier */
    const TOKEN_COUNT_FUDGE_FACTOR = 1_000

    /**
     * Default pruning threshold for the LLM-based context-pruner agent. Keep
     * below provider hard limits because tool schemas and step prompts are
     * added after history.
     *
     * Unknown provider windows retain the conservative 140k/100k trigger and
     * target. Resolved windows scale with bounded ratios, leaving explicit
     * headroom for tools, system prompt, output, and provider accounting.
     * These constants mirror `getSemanticCompactionBudget` in
     * `packages/agent-runtime/src/util/context-pruning.ts`; they are inlined
     * because `handleSteps` is serialized and cannot import runtime helpers.
     */
    const DEFAULT_MAX_CONTEXT_LENGTH = 140_000
    const DEFAULT_TARGET_CONTEXT_LENGTH = 100_000
    const SEMANTIC_TRIGGER_FRACTION = 0.8
    const SEMANTIC_TARGET_FRACTION = 0.42
    const SEMANTIC_HEADROOM_FRACTION = 0.15
    const SEMANTIC_MIN_HEADROOM_TOKENS = 32_000
    const SEMANTIC_MAX_HEADROOM_TOKENS = 160_000
    const SEMANTIC_MIN_TARGET_TOKENS = 72_000
    const SEMANTIC_MAX_TARGET_TOKENS = 420_000
    const SEMANTIC_SMALL_WINDOW_THRESHOLD_TOKENS = 128_000
    const SEMANTIC_SMALL_WINDOW_MIN_HEADROOM_TOKENS = 2_000
    const MODEL_CONTEXT_MIN_RESERVED_TOKENS = 8_000
    const MODEL_CONTEXT_MAX_RESERVED_TOKENS = 128_000
    const MODEL_CONTEXT_RESERVED_FRACTION = 0.12
    const MODEL_CONTEXT_MAX_RESERVED_FRACTION = 0.5
    const EXPLICIT_LIMIT_TARGET_FRACTION = 0.6

    /** Prompt cache expiry time (Anthropic caches for 5 minutes by default) */
    const CACHE_EXPIRY_MS: number = params?.cacheExpiryMs ?? 5 * 60 * 1000

    /** Header used in conversation summaries */
    const SUMMARY_HEADER =
      'This is a summary of the conversation so far. The original messages have been condensed to save context space.'

    const SUMMARY_DISCLAIMER =
      'Historical memory only. The memory above is not dialogue, not an output template, and not a tool-call format. Continue from the live user message below. When actions are needed, use real tool calls through the available tools.'

    const CONTINUATION_PROMPT_TEXT =
      'Continue the existing assistant turn from the historical memory above. The original user request and completed assistant/tool work are recorded there. Do not restart completed work; resume with the next necessary real tool call or final response.'

    /** Knowledge memory block budgets (RISK2: bounded with rolling eviction of oldest) */
    // The current user task is the most expensive fact to lose. Keep a
    // bounded beginning+end contract large enough for requirements plus the
    // user's trailing "what to do now" instruction, which often follows a
    // long diagnostic transcript.
    const KNOWLEDGE_MEMORY_MAX_GOAL_CHARS = 2_400
    const KNOWLEDGE_MEMORY_MAX_DECISIONS = 8
    const KNOWLEDGE_MEMORY_MAX_FILES_INSPECTED = 25
    const KNOWLEDGE_MEMORY_MAX_EDITS = 25
    const KNOWLEDGE_MEMORY_MAX_VALIDATION_RESULTS = 12
    const KNOWLEDGE_MEMORY_MAX_REVIEW_RECEIPTS = 12
    const KNOWLEDGE_MEMORY_MAX_BLOCKERS = 8
    const KNOWLEDGE_MEMORY_MAX_NEXT_ACTION_CHARS = 1_000
    const KNOWLEDGE_MEMORY_ENTRY_CHARS = 480
    const KNOWLEDGE_MEMORY_FILE_FINDING_CHARS = 160
    const KNOWLEDGE_MEMORY_REVIEW_RECEIPT_CHARS = 1_200
    const TOOL_ERROR_DETAIL_CHARS = 1_200
    const EDIT_RESULT_DETAIL_CHARS = 2_000

    /** Tool categories for knowledge memory extraction */
    const FILE_INSPECTION_TOOLS = [
      'read_files',
      'read_outline',
      'read_subtree',
      'read_image',
      'code_search',
      'code_searcher',
      'query_index',
      'glob',
      'list_directory',
      'file_picker',
    ]
    const EDIT_TOOLS = [
      'str_replace',
      'write_file',
      'rewrite_symbol',
      'edit_transaction',
      'replace_range',
      'apply_patch',
      'apply_smart_patch',
    ]
    const VALIDATION_TOOLS = ['run_terminal_command', 'basher']
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
          return pattern ? `code search for "${pattern}"` : 'code search'
        }
        case 'glob': {
          const pattern = input.pattern as string | undefined
          return pattern ? `glob search for ${pattern}` : 'glob search'
        }
        case 'list_directory': {
          const path = input.path as string | undefined
          return path ? `listed directory: ${path}` : 'listed a directory'
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
            const visibleIncomplete = incomplete.slice(
              0,
              MAX_TODO_TASKS_IN_SUMMARY,
            )
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
    const resolvedContextWindow = agentState.contextWindowTokens
    const hasResolvedContextWindow =
      typeof resolvedContextWindow === 'number' &&
      Number.isFinite(resolvedContextWindow) &&
      resolvedContextWindow > 0
    const injectedSemanticBudget =
      params?.semanticBudget && typeof params.semanticBudget === 'object'
        ? params.semanticBudget
        : undefined
    const injectedTrigger = injectedSemanticBudget?.triggerBudgetTokens
    const injectedTarget = injectedSemanticBudget?.targetBudgetTokens
    const hasInjectedSemanticBudget =
      typeof injectedTrigger === 'number' &&
      Number.isFinite(injectedTrigger) &&
      injectedTrigger > 0 &&
      typeof injectedTarget === 'number' &&
      Number.isFinite(injectedTarget) &&
      injectedTarget > 0

    // Compatibility fallback for direct template execution in tests/custom
    // runtimes. Production injects the authoritative runtime budget above.
    let fallbackTrigger = DEFAULT_MAX_CONTEXT_LENGTH
    let fallbackTarget = DEFAULT_TARGET_CONTEXT_LENGTH
    if (hasResolvedContextWindow) {
      if (resolvedContextWindow < SEMANTIC_SMALL_WINDOW_THRESHOLD_TOKENS) {
        const reservedTokens = Math.min(
          Math.max(
            1,
            Math.floor(
              resolvedContextWindow * MODEL_CONTEXT_MAX_RESERVED_FRACTION,
            ),
          ),
          Math.min(
            MODEL_CONTEXT_MAX_RESERVED_TOKENS,
            Math.max(
              MODEL_CONTEXT_MIN_RESERVED_TOKENS,
              Math.floor(
                resolvedContextWindow * MODEL_CONTEXT_RESERVED_FRACTION,
              ),
            ),
          ),
        )
        const providerSafeMessageLimit = Math.max(
          1,
          resolvedContextWindow - reservedTokens,
        )
        const semanticHeadroom = Math.max(
          1,
          Math.min(
            SEMANTIC_MIN_HEADROOM_TOKENS,
            Math.max(
              SEMANTIC_SMALL_WINDOW_MIN_HEADROOM_TOKENS,
              Math.floor(providerSafeMessageLimit * 0.25),
            ),
          ),
        )
        fallbackTrigger = Math.max(
          1,
          Math.min(
            Math.floor(providerSafeMessageLimit * SEMANTIC_TRIGGER_FRACTION),
            providerSafeMessageLimit - semanticHeadroom,
          ),
        )
        fallbackTarget = Math.max(
          1,
          Math.min(
            Math.floor(providerSafeMessageLimit * SEMANTIC_TARGET_FRACTION),
            fallbackTrigger - 1,
          ),
        )
      } else {
        const semanticHeadroom = Math.min(
          SEMANTIC_MAX_HEADROOM_TOKENS,
          Math.max(
            SEMANTIC_MIN_HEADROOM_TOKENS,
            Math.floor(resolvedContextWindow * SEMANTIC_HEADROOM_FRACTION),
          ),
        )
        fallbackTrigger = Math.max(
          1,
          Math.min(
            Math.floor(resolvedContextWindow * SEMANTIC_TRIGGER_FRACTION),
            resolvedContextWindow - semanticHeadroom,
          ),
        )
        fallbackTarget = Math.max(
          1,
          Math.min(
            Math.min(
              SEMANTIC_MAX_TARGET_TOKENS,
              Math.max(
                SEMANTIC_MIN_TARGET_TOKENS,
                Math.floor(resolvedContextWindow * SEMANTIC_TARGET_FRACTION),
              ),
            ),
            fallbackTrigger - 1,
          ),
        )
      }
    }
    const modelAwareDefaultContextLength = hasInjectedSemanticBudget
      ? injectedTrigger
      : fallbackTrigger
    const modelAwareTargetContextLength = hasInjectedSemanticBudget
      ? injectedTarget
      : fallbackTarget
    const maxContextLength: number =
      params?.maxContextLength ?? modelAwareDefaultContextLength
    const targetContextLength =
      params?.maxContextLength === undefined
        ? modelAwareTargetContextLength
        : Math.max(
            1,
            Math.min(
              modelAwareTargetContextLength,
              Math.floor(maxContextLength * EXPLICIT_LIMIT_TARGET_FRACTION),
            ),
          )

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
      const candidate =
        lastUserPromptIndex !== -1
          ? currentMessages[lastUserPromptIndex]
          : undefined
      const candidateText = candidate
        ? getTextContent(candidate)
            .trim()
            .replace(/^<user_message>\s*/i, '')
            .replace(/\s*<\/user_message>$/i, '')
        : ''
      let isParamsPrompt = false
      if (candidateText) {
        try {
          const parsed = JSON.parse(candidateText)
          isParamsPrompt =
            parsed !== null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            Object.keys(parsed).some((key) =>
              Object.prototype.hasOwnProperty.call(params, key),
            )
        } catch {
          isParamsPrompt = false
        }
      }
      if (lastUserPromptIndex !== -1 && isParamsPrompt) {
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

    // Check if we need to prune at all.
    // Prune ONLY when context exceeds the token threshold.
    // Cache-TTL expiry (cacheWillMiss) no longer triggers summarization —
    // summarizing on every 5-min gap destroys stable cache prefixes and
    // causes rapid cache refill (the "cache fills up fast" symptom).
    // The provider simply re-writes the cache, which is cheaper than
    // regenerating a summary blob. M2 will add explicit cache-marker
    // re-stamping here via the stable-anchor policy.
    if (
      agentState.contextTokenCount + TOKEN_COUNT_FUDGE_FACTOR <=
      maxContextLength
    ) {
      // cacheWillMiss is computed for M2's cache-marker refresh path;
      // referenced here to avoid dead-code elimination until M2 lands.
      void cacheWillMiss
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
      params?.assistantToolBudget ??
      Math.floor(targetContextLength * ASSISTANT_TOOL_BUDGET_FRACTION)
    const userBudget: number =
      params?.userBudget ??
      Math.floor(targetContextLength * USER_BUDGET_FRACTION)
    const toolFactsBudget: number =
      params?.toolFactsBudget ??
      Math.floor(targetContextLength * TOOL_FACTS_BUDGET_FRACTION)

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
    function parseSummaryIntoEntries(summaryText: string): Array<{
      role: 'user' | 'assistant_tool' | 'tool_facts'
      parts: string[]
    }> {
      if (!summaryText.trim()) return []

      const withoutPinnedState = summaryText
        .replace(
          /<pinned_active_work_state>[\s\S]*?<\/pinned_active_work_state>\n*/g,
          '',
        )
        .replace(/<knowledge_memory>[\s\S]*?<\/knowledge_memory>\n*/g, '')
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
        // M6 (SPEC R7): classify tool-facts entries by their known prefixes so
        // they consume the reserved tool-facts budget on re-pruning.
        const isToolFacts =
          trimmed.startsWith('Edit result from ') ||
          trimmed.startsWith('Tool error from ') ||
          trimmed.startsWith('Command failed with exit code:') ||
          trimmed.startsWith('User answered:') ||
          trimmed.startsWith('User skipped question') ||
          trimmed.startsWith('Agent results:')
        return {
          role: isUser
            ? ('user' as const)
            : isToolFacts
              ? ('tool_facts' as const)
              : ('assistant_tool' as const),
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

    // =========================================================================
    // Knowledge Memory (M5): structured operational memory pinned verbatim
    // across compaction, parallel to <pinned_active_work_state>. Preserves
    // Goal, Decisions, Files Inspected, Edits Made, Validation Results,
    // Blockers, Next Action — the facts the extractive summary loses.
    // =========================================================================

    interface KnowledgeMemory {
      goal: string
      decisions: string[]
      filesInspected: string[] // "path: finding"
      editsMade: string[] // "path: summary"
      validationResults: string[]
      reviewReceipts: string[]
      blockers: string[]
      nextAction: string
    }

    function createEmptyKnowledgeMemory(): KnowledgeMemory {
      return {
        goal: '',
        decisions: [],
        filesInspected: [],
        editsMade: [],
        validationResults: [],
        reviewReceipts: [],
        blockers: [],
        nextAction: '',
      }
    }

    function addUniqueEntry(lines: string[], entry: string): void {
      const trimmed = entry.trim()
      if (trimmed && !lines.includes(trimmed)) {
        lines.push(trimmed)
      }
    }

    /** Parse a previous <knowledge_memory> block back into the accumulator. */
    function extractKnowledgeMemoryFromText(text: string): KnowledgeMemory {
      const km = createEmptyKnowledgeMemory()
      const blockMatch = text.match(
        /<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/,
      )
      if (!blockMatch) return km
      const block = blockMatch[1]

      const goalMatch = block.match(
        /Goal:\s*([\s\S]*?)(?=\nDecisions:|\nFiles Inspected:|\nEdits Made:|\nValidation Results:|\nReview Receipts:|\nBlockers:|\nNext Action:|$)/,
      )
      if (goalMatch) km.goal = goalMatch[1].trim()

      // Capture every "Header:\n  - entry" list section in one pass.
      // NOTE: must use a regex literal (not `new RegExp(template)`) so that
      // \s/\S are interpreted as regex whitespace classes. In a template
      // literal, `\s` becomes a literal `s`, which silently breaks parsing
      // and causes structured fields to be lost on re-compaction.
      const SECTION_RE =
        /^(Goal|Decisions|Files Inspected|Edits Made|Validation Results|Review Receipts|Blockers|Next Action):\s*([\s\S]*?)(?=\n(?:Goal|Decisions|Files Inspected|Edits Made|Validation Results|Review Receipts|Blockers|Next Action):|(?![\s\S]))/gm
      let sectionMatch: RegExpExecArray | null
      while ((sectionMatch = SECTION_RE.exec(block)) !== null) {
        const header = sectionMatch[1]
        const rawBody = sectionMatch[2]
        const items = rawBody
          .split('\n')
          .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
          .filter((l) => l.length > 0)
        if (header === 'Goal') {
          km.goal = items.join(' ').trim()
        } else if (header === 'Next Action') {
          km.nextAction = rawBody.trim()
        } else if (header === 'Decisions') {
          km.decisions = items
        } else if (header === 'Files Inspected') {
          km.filesInspected = items
        } else if (header === 'Edits Made') {
          km.editsMade = items
        } else if (header === 'Validation Results') {
          km.validationResults = items
        } else if (header === 'Review Receipts') {
          km.reviewReceipts = items
        } else if (header === 'Blockers') {
          km.blockers = items
        }
      }

      return km
    }

    function extractPreviousKnowledgeMemory(): KnowledgeMemory {
      let km = createEmptyKnowledgeMemory()
      for (const message of currentMessages) {
        if (isConversationSummary(message)) {
          const text = getTextContent(message)
          km = extractKnowledgeMemoryFromText(text)
        }
      }
      return km
    }

    /** Extract a path-like string from a tool input, normalizing common shapes. */
    function extractPathFromInput(input: Record<string, unknown>): string {
      const pathRaw =
        (input.path as string | undefined) ||
        (input.filePath as string | undefined) ||
        (input.targetFile as string | undefined) ||
        (Array.isArray(input.paths) && input.paths.length > 0
          ? (input.paths[0] as string)
          : undefined)
      if (!pathRaw || typeof pathRaw !== 'string') return ''
      // For arrays of paths (read_files), include the first; others handled by repeated calls
      return pathRaw.replace(/^['"]|['"]$/g, '').trim()
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return (
        Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      )
    }

    function isReadFailureText(text: string): boolean {
      return /^\[(?:FILE_DOES_NOT_EXIST|BLOCKED|FILE_OUTSIDE_PROJECT|FILE_TOO_LARGE|FILE_READ_ERROR)\]/.test(
        text.trim(),
      )
    }

    function isEditFailureText(text: string): boolean {
      return (
        /\b(?:not|never)\s+(?:been\s+)?(?:applied|updated|created|written|edited|replaced|successful(?:ly)?)\b/i.test(
          text,
        ) ||
        /\b(?:could|can|did|was|were|is|are|has|have|had)\s+not\s+(?:been\s+)?(?:apply|applied|update|updated|create|created|write|written|edit|edited|replace|replaced|succeed|successful)/i.test(
          text,
        ) ||
        /\bfailed to (?:apply|update|create|write|edit|replace)\b/i.test(
          text,
        ) ||
        /\bno changes were (?:made|written)\b/i.test(text)
      )
    }

    function addUniqueText(texts: string[], text: string): void {
      const trimmed = text.trim()
      if (trimmed && !texts.includes(trimmed)) texts.push(trimmed)
    }

    function collectFailureTexts(
      value: unknown,
      texts: string[],
      depth = 0,
    ): void {
      if (depth > 8 || value === null || value === undefined) return
      if (typeof value === 'string') {
        if (
          isReadFailureText(value) ||
          /^(?:error|failed)\b/i.test(value.trim()) ||
          isEditFailureText(value)
        ) {
          addUniqueText(texts, value)
        }
        return
      }
      if (Array.isArray(value)) {
        for (const item of value) collectFailureTexts(item, texts, depth + 1)
        return
      }
      if (!isRecord(value)) return

      if (
        value.kind === 'read_files_result' &&
        value.version === 1 &&
        Array.isArray(value.results)
      ) {
        for (const result of value.results) {
          if (!isRecord(result) || result.status !== 'error') continue
          if (
            isRecord(result.error) &&
            typeof result.error.message === 'string'
          ) {
            addUniqueText(texts, result.error.message)
          }
        }
      }

      const errorMessage = value.errorMessage
      if (typeof errorMessage === 'string') addUniqueText(texts, errorMessage)
      const error = value.error
      if (typeof error === 'string') addUniqueText(texts, error)
      else if (error !== undefined) collectFailureTexts(error, texts, depth + 1)

      const explicitlyFailed =
        value.success === false || value.applied === false
      if (explicitlyFailed && typeof value.message === 'string') {
        addUniqueText(texts, value.message)
      } else if (value.success === false) {
        addUniqueText(texts, 'success: false')
      } else if (value.applied === false) {
        addUniqueText(texts, 'applied: false')
      }
      if (
        typeof value.message === 'string' &&
        (/^(?:error|failed)\b/i.test(value.message.trim()) ||
          isEditFailureText(value.message))
      ) {
        addUniqueText(texts, value.message)
      }
      if (
        typeof value.status === 'string' &&
        /^(?:failed|error|blocked)$/i.test(value.status)
      ) {
        addUniqueText(texts, `status: ${value.status}`)
      }

      const summary = value.summary
      if (isRecord(summary)) {
        const failed = summary.failed
        const requested = summary.requested
        if (typeof failed === 'number' && failed > 0) {
          addUniqueText(
            texts,
            typeof requested === 'number'
              ? `${failed} of ${requested} requested read(s) failed.`
              : `${failed} requested read(s) failed.`,
          )
        }
      } else if (
        typeof value.failed === 'number' &&
        value.failed > 0 &&
        typeof value.requested === 'number'
      ) {
        addUniqueText(
          texts,
          `${value.failed} of ${value.requested} requested read(s) failed.`,
        )
      }

      for (const [key, nested] of Object.entries(value)) {
        if (key === 'errorMessage' || key === 'error' || key === 'message') {
          continue
        }
        collectFailureTexts(nested, texts, depth + 1)
      }
    }

    function summarizeToolFailure(values: unknown[]): string | null {
      const texts: string[] = []
      for (const value of values) collectFailureTexts(value, texts)
      if (texts.length === 0) return null
      return truncateLongText(texts.join('\n'), TOOL_ERROR_DETAIL_CHARS)
    }

    function hasFailureMarker(values: unknown[]): boolean {
      return summarizeToolFailure(values) !== null
    }

    function getInspectionPaths(
      toolName: string,
      input: Record<string, unknown>,
    ): string[] {
      const paths: string[] = []
      const addPath = (value: unknown) => {
        if (typeof value === 'string' && value.trim()) {
          addUniqueText(paths, value.trim())
        }
      }

      if (Array.isArray(input.paths)) {
        for (const path of input.paths) addPath(path)
      }
      if (toolName === 'read_files') {
        if (Array.isArray(input.ranges)) {
          for (const range of input.ranges) {
            if (isRecord(range)) addPath(range.path)
          }
        }
        if (Array.isArray(input.symbols)) {
          for (const symbolRequest of input.symbols) {
            if (isRecord(symbolRequest)) addPath(symbolRequest.path)
          }
        }
      }
      addPath(input.path)
      if (paths.length === 0 && typeof input.pattern === 'string') {
        paths.push(`glob: ${input.pattern}`)
      }
      if (paths.length === 0 && typeof input.query === 'string') {
        paths.push(`index: ${input.query}`)
      }
      return paths
    }

    function getEditPaths(input: Record<string, unknown>): string[] {
      const paths: string[] = []
      const addPath = (value: unknown) => {
        if (typeof value === 'string' && value.trim()) {
          addUniqueText(paths, value.trim())
        }
      }
      addPath(extractPathFromInput(input))
      if (isRecord(input.operation)) addPath(input.operation.path)
      if (Array.isArray(input.edits)) {
        for (const edit of input.edits) {
          if (isRecord(edit)) addPath(extractPathFromInput(edit))
        }
      }
      return paths
    }

    function getSuccessfulReadPaths(
      input: Record<string, unknown>,
      values: unknown[],
    ): string[] {
      const requestedPaths = getInspectionPaths('read_files', input)
      if (values.length === 0 || requestedPaths.length === 0) return []

      for (const value of values) {
        if (!isRecord(value) || value.kind !== 'read_files_result') continue
        if (value.version !== 1 || !Array.isArray(value.results)) return []
        const canonicalPaths: string[] = []
        for (const result of value.results) {
          if (
            isRecord(result) &&
            typeof result.path === 'string' &&
            (result.status === 'ok' || result.status === 'partial')
          ) {
            addUniqueText(canonicalPaths, result.path)
          }
        }
        const requestedPathSet = new Set(requestedPaths)
        return canonicalPaths.filter((path) => requestedPathSet.has(path))
      }

      const successfulPaths: string[] = []
      let sawStructuredEntry = false
      let summaryFailed: number | null = null
      let summaryOk: number | null = null
      let directContentSucceeded = false

      const inspect = (value: unknown, depth = 0): void => {
        if (depth > 5 || value === null || value === undefined) return
        if (Array.isArray(value)) {
          for (const item of value) inspect(item, depth + 1)
          return
        }
        if (!isRecord(value)) return

        if (isRecord(value.summary)) {
          const failed = value.summary.failed
          const ok = value.summary.ok
          if (typeof failed === 'number') summaryFailed = failed
          if (typeof ok === 'number') summaryOk = ok
        } else {
          if (typeof value.failed === 'number') summaryFailed = value.failed
          if (typeof value.ok === 'number') summaryOk = value.ok
        }

        const path = typeof value.path === 'string' ? value.path.trim() : ''
        if (path && typeof value.content === 'string') {
          sawStructuredEntry = true
          if (!isReadFailureText(value.content))
            addUniqueText(successfulPaths, path)
        } else if (path && Array.isArray(value.slices)) {
          sawStructuredEntry = true
          if (value.slices.length > 0) addUniqueText(successfulPaths, path)
        } else if (typeof value.content === 'string') {
          sawStructuredEntry = true
          directContentSucceeded = !isReadFailureText(value.content)
        }
      }

      for (const value of values) inspect(value)
      if (successfulPaths.length > 0) {
        const requestedPathSet = new Set(requestedPaths)
        return successfulPaths.filter((path) => requestedPathSet.has(path))
      }
      if (sawStructuredEntry) {
        return directContentSucceeded &&
          (summaryFailed === null || summaryFailed === 0)
          ? requestedPaths
          : []
      }
      if (summaryFailed !== null) {
        return summaryFailed === 0 && (summaryOk ?? 0) > 0 ? requestedPaths : []
      }
      return hasFailureMarker(values) ? [] : requestedPaths
    }

    function getConfirmedMutationPaths(values: unknown[]): string[] {
      const paths = new Set<string>()
      const inspect = (value: unknown, depth = 0): void => {
        if (depth > 6 || value === null || value === undefined) {
          return
        }
        if (Array.isArray(value)) {
          for (const item of value) inspect(item, depth + 1)
          return
        }
        if (!isRecord(value)) return
        if (
          value.kind === 'file_mutation_result' &&
          value.version === 1 &&
          typeof value.operationId === 'string' &&
          value.operationId.length > 0 &&
          (value.authorityTier === 'portable_path' ||
            value.authorityTier === 'conditional_commit') &&
          (value.outcome === 'applied' ||
            value.outcome === 'partial' ||
            value.outcome === 'rollback_incomplete') &&
          Array.isArray(value.actions) &&
          value.authorityReceipt !== null &&
          typeof value.authorityReceipt === 'object' &&
          !Array.isArray(value.authorityReceipt) &&
          (value.authorityReceipt as Record<string, unknown>).operationId ===
            value.operationId &&
          (value.authorityReceipt as Record<string, unknown>).receiptId ===
            value.receiptId &&
          Array.isArray(
            (value.authorityReceipt as Record<string, unknown>).actions,
          ) &&
          (
            (value.authorityReceipt as Record<string, unknown>)
              .actions as unknown[]
          ).length === value.actions.length &&
          value.actions.every(
            (action, index) =>
              isRecord(action) &&
              action.index === index &&
              typeof action.actionId === 'string' &&
              typeof action.path === 'string' &&
              (
                (value.authorityReceipt as Record<string, unknown>)
                  .actions as Array<Record<string, unknown>>
              )[index]?.actionId === action.actionId,
          ) &&
          Array.isArray(value.errors) &&
          Array.isArray(value.freshCapabilities)
        ) {
          for (const action of value.actions) {
            if (!isRecord(action) || action.outcome !== 'applied') continue
            if (typeof action.path === 'string') paths.add(action.path)
            if (
              action.action === 'move' &&
              typeof action.destinationPath === 'string'
            ) {
              paths.add(action.destinationPath)
            }
          }
        }
        for (const nested of Object.values(value)) inspect(nested, depth + 1)
      }
      for (const value of values) inspect(value)
      return [...paths]
    }

    function extractFindingsSummary(text: string): string {
      // Pull a one-line finding from tool result text: look for the first
      // non-empty line that looks like a finding, or truncate the whole thing.
      const lines = text
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('---') && !l.startsWith('```'))
      if (lines.length === 0) return ''
      const first = lines[0]
      if (first.length <= KNOWLEDGE_MEMORY_FILE_FINDING_CHARS) return first
      return first.slice(0, KNOWLEDGE_MEMORY_FILE_FINDING_CHARS - 3) + '...'
    }

    /** Apply per-field budgets with rolling eviction of oldest entries (RISK2). */
    function enforceKnowledgeMemoryBudgets(km: KnowledgeMemory): void {
      const capTextPreservingEnds = (text: string, max: number): string =>
        truncateLongText(text, max)

      km.goal = capTextPreservingEnds(km.goal, KNOWLEDGE_MEMORY_MAX_GOAL_CHARS)
      km.nextAction = capTextPreservingEnds(
        km.nextAction,
        KNOWLEDGE_MEMORY_MAX_NEXT_ACTION_CHARS,
      )
      if (km.decisions.length > KNOWLEDGE_MEMORY_MAX_DECISIONS) {
        km.decisions = km.decisions.slice(-KNOWLEDGE_MEMORY_MAX_DECISIONS)
      }
      if (km.filesInspected.length > KNOWLEDGE_MEMORY_MAX_FILES_INSPECTED) {
        km.filesInspected = km.filesInspected.slice(
          -KNOWLEDGE_MEMORY_MAX_FILES_INSPECTED,
        )
      }
      if (km.editsMade.length > KNOWLEDGE_MEMORY_MAX_EDITS) {
        km.editsMade = km.editsMade.slice(-KNOWLEDGE_MEMORY_MAX_EDITS)
      }
      if (
        km.validationResults.length > KNOWLEDGE_MEMORY_MAX_VALIDATION_RESULTS
      ) {
        km.validationResults = km.validationResults.slice(
          -KNOWLEDGE_MEMORY_MAX_VALIDATION_RESULTS,
        )
      }
      if (km.reviewReceipts.length > KNOWLEDGE_MEMORY_MAX_REVIEW_RECEIPTS) {
        km.reviewReceipts = km.reviewReceipts.slice(
          -KNOWLEDGE_MEMORY_MAX_REVIEW_RECEIPTS,
        )
      }
      if (km.blockers.length > KNOWLEDGE_MEMORY_MAX_BLOCKERS) {
        km.blockers = km.blockers.slice(-KNOWLEDGE_MEMORY_MAX_BLOCKERS)
      }
      // Per-entry length caps
      const capEntry = (entry: string, max: number): string => {
        return capTextPreservingEnds(entry, max)
      }
      km.decisions = km.decisions.map((e) =>
        capEntry(e, KNOWLEDGE_MEMORY_ENTRY_CHARS),
      )
      km.filesInspected = km.filesInspected.map((e) =>
        capEntry(e, KNOWLEDGE_MEMORY_FILE_FINDING_CHARS + 200),
      )
      km.editsMade = km.editsMade.map((e) =>
        capEntry(e, KNOWLEDGE_MEMORY_ENTRY_CHARS),
      )
      km.validationResults = km.validationResults.map((e) =>
        capEntry(e, KNOWLEDGE_MEMORY_ENTRY_CHARS),
      )
      km.reviewReceipts = km.reviewReceipts.map((e) =>
        capEntry(e, KNOWLEDGE_MEMORY_REVIEW_RECEIPT_CHARS),
      )
      km.blockers = km.blockers.map((e) =>
        capEntry(e, KNOWLEDGE_MEMORY_ENTRY_CHARS),
      )
    }

    /** Detect the latest substantive user request or override. */
    function extractGoalFromMessages(): string {
      const candidates = [
        ...(latestLiveUserPromptMessage ? [latestLiveUserPromptMessage] : []),
        ...messagesToSummarize,
      ].filter((message) => message.role === 'user')
      const taggedCandidates = candidates
        .filter((message) => message.tags?.includes('USER_PROMPT'))
        .reverse()
      const taggedSet = new Set(taggedCandidates)
      const ordered = [
        ...taggedCandidates,
        ...[...candidates]
          .reverse()
          .filter((message) => !taggedSet.has(message)),
      ]
      for (const message of ordered) {
        const text = sanitizeOperationalStateText(getTextContent(message))
          .replace(/^<user_message>([\s\S]*?)<\/user_message>$/i, '$1')
          .trim()
        if (!text) continue
        // Skip tool-result-style user messages and system tags
        if (text.startsWith('[USER]')) continue
        if (text.startsWith('<')) continue
        if (text === CONTINUATION_PROMPT_TEXT) continue
        if (/^(?:Reviewer|Verification|Harness) gate:/i.test(text)) continue
        const truncated = truncateLongText(
          text,
          KNOWLEDGE_MEMORY_MAX_GOAL_CHARS,
        )
        return truncated
          .replace(/\[\.\.\.truncated \d+ chars\.\.\.\]\n*/g, ' ')
          .trim()
      }
      return ''
    }

    function extractNextActionFromRuntimeState(pinnedLines: string[]): string {
      const activeWork = agentState.base2ActiveWork
      if (activeWork && typeof activeWork === 'object') {
        const nextRequiredAction = activeWork.nextRequiredAction
        if (
          typeof nextRequiredAction === 'string' &&
          nextRequiredAction.trim()
        ) {
          return nextRequiredAction.trim()
        }
        const workflow = activeWork.workflowTodoProgress
        if (workflow && typeof workflow === 'object') {
          const nextWorkflowAction = (workflow as Record<string, unknown>)
            .nextWorkflowAction
          if (
            typeof nextWorkflowAction === 'string' &&
            nextWorkflowAction.trim()
          ) {
            return nextWorkflowAction.trim()
          }
        }
        // Runtime state is authoritative: an explicitly empty next action
        // clears stale action text retained in an older summary.
        return ''
      }
      for (let index = pinnedLines.length - 1; index >= 0; index--) {
        const match = pinnedLines[index].match(
          /^(?:Next required action|Next workflow action):\s*(.+)$/i,
        )
        if (match?.[1]) return match[1].trim()
      }
      return ''
    }

    function findStructuredReviewerOutput(
      value: unknown,
    ): Record<string, unknown> | null {
      if (!value) return null
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index--) {
          const found = findStructuredReviewerOutput(value[index])
          if (found) return found
        }
        return null
      }
      if (typeof value !== 'object') return null
      const record = value as Record<string, unknown>
      if (record.type === 'json' && 'value' in record) {
        return findStructuredReviewerOutput(record.value)
      }
      if (
        typeof record.verdict === 'string' &&
        ['LOOKS_GOOD', 'NON_BLOCKING', 'BLOCKING'].includes(
          record.verdict.trim().toUpperCase(),
        )
      ) {
        return record
      }
      for (const nested of Object.values(record)) {
        const found = findStructuredReviewerOutput(nested)
        if (found) return found
      }
      return null
    }

    function formatStructuredReviewReceipt(
      agentType: string,
      value: unknown,
    ): string {
      const record = findStructuredReviewerOutput(value)
      if (!record) return ''
      const verdict = isStaleSnapshotReviewerOutput(value)
        ? 'STALE_SNAPSHOT'
        : String(record.verdict).trim().toUpperCase()
      const fingerprint =
        typeof record.snapshotFingerprint === 'string'
          ? record.snapshotFingerprint
          : '(legacy/unattested)'
      const coverage =
        typeof record.coverage === 'string' ? record.coverage : 'n/a'
      const findingIds = Array.isArray(record.findings)
        ? record.findings.flatMap((finding) =>
            finding &&
            typeof finding === 'object' &&
            typeof (finding as Record<string, unknown>).id === 'string'
              ? [(finding as Record<string, string>).id]
              : [],
          )
        : []
      return `${agentType}: verdict=${verdict}; snapshot=${fingerprint}; coverage=${coverage}; findingIds=${findingIds.join(',') || '(none)'}`
    }

    function isStaleSnapshotReviewerOutput(value: unknown): boolean {
      const record = findStructuredReviewerOutput(value)
      if (!record || !Array.isArray(record.findings)) return false
      return record.findings.some((finding) => {
        if (!finding || typeof finding !== 'object') return false
        const findingRecord = finding as Record<string, unknown>
        const id =
          typeof findingRecord.id === 'string'
            ? findingRecord.id.toLowerCase()
            : ''
        const summary =
          typeof findingRecord.summary === 'string'
            ? findingRecord.summary.toLowerCase()
            : ''
        return (
          id.endsWith(':stale-snapshot') ||
          (summary.includes('snapshot') &&
            (summary.includes('stale') || summary.includes('does not match')))
        )
      })
    }

    /** Detect decision lines from assistant text (heuristic: lines starting with decision markers). */
    function extractDecisionsFromAssistantText(text: string): string[] {
      const decisions: string[] = []
      const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '')
      const lines = withoutThink.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        // Match common decision markers in agent output
        if (
          /^(?:Decision|Decided|Chose|Using|Selected|Will use|Opted)[:)]?\s/i.test(
            trimmed,
          ) ||
          /^[-*]\s*(?:Decision|Decided|Chose|Using|Selected)[:)]?\s/i.test(
            trimmed,
          )
        ) {
          const cleaned = trimmed.replace(/^[-*]\s*/, '').trim()
          if (cleaned.length > 0) {
            addUniqueEntry(decisions, cleaned)
          }
        }
      }
      return decisions
    }

    function isActionableReviewerLine(line: string): boolean {
      return /^(?:[-*]\s*)?(?:BLOCKING|SECURITY|CRITICAL|HIGH|MEDIUM|LOW|FINDING|VULNERABILITY|ACTION_REQUIRED|REQUIRED_ACTION|REQUIRED FOLLOW-UP|FOLLOW-UP REQUIRED|NEXT REQUIRED ACTION|NEXT ACTION|Blocker|Finding|Security finding|Required follow-up|Required action)\b[:)]?\s/i.test(
        line,
      )
    }

    function extractActionableReviewerLines(text: string): string[] {
      const lines: string[] = []
      const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '')
      for (const line of withoutThink.split('\n')) {
        const trimmed = line
          .trim()
          .replace(/^[-*]\s*/, '')
          .trim()
        if (!trimmed || trimmed.startsWith('```')) continue
        if (isActionableReviewerLine(trimmed)) {
          addUniqueEntry(lines, trimmed)
        }
      }
      return lines
    }

    function collectReviewerOutputText(value: unknown, lines: string[]): void {
      if (typeof value === 'string') {
        lines.push(value)
        return
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          collectReviewerOutputText(item, lines)
        }
        return
      }
      if (value && typeof value === 'object') {
        for (const nestedValue of Object.values(value)) {
          collectReviewerOutputText(nestedValue, lines)
        }
      }
    }

    function reviewerOutputToText(value: unknown): string {
      if (value === undefined || value === null) return ''
      if (typeof value === 'string') return value
      const lines: string[] = []
      collectReviewerOutputText(value, lines)
      return lines.length > 0 ? lines.join('\n') : JSON.stringify(value)
    }

    function extractFilePickerFacts(
      value: unknown,
    ): Array<{ path: string; summary: string }> {
      const facts: Array<{ path: string; summary: string }> = []
      const visit = (candidate: unknown): void => {
        if (!candidate || typeof candidate !== 'object') return
        if (Array.isArray(candidate)) {
          for (const item of candidate) visit(item)
          return
        }
        const record = candidate as Record<string, unknown>
        if (Array.isArray(record.files)) {
          for (const file of record.files) {
            if (!file || typeof file !== 'object') continue
            const fileRecord = file as Record<string, unknown>
            const path =
              typeof fileRecord.path === 'string' ? fileRecord.path.trim() : ''
            const summary =
              typeof fileRecord.summary === 'string'
                ? fileRecord.summary.trim()
                : ''
            if (path && summary && !facts.some((fact) => fact.path === path)) {
              facts.push({ path, summary })
            }
          }
        }
        for (const nested of Object.values(record)) visit(nested)
      }
      visit(value)
      return facts.slice(0, 12)
    }

    function extractReviewerFindingSummary(value: unknown): string {
      const reviewerOutput = reviewerOutputToText(value)
      const actionableLines = extractActionableReviewerLines(reviewerOutput)
      if (actionableLines.length > 0) {
        return actionableLines.join('\n')
      }
      return extractFindingsSummary(reviewerOutput)
    }

    function extractBlockersFromText(text: string): string[] {
      const blockers: string[] = []
      for (const line of extractActionableReviewerLines(text)) {
        addUniqueEntry(blockers, line)
      }
      return blockers
    }
    /** Build the final <knowledge_memory> block string. */
    function buildKnowledgeMemoryBlock(km: KnowledgeMemory): string {
      const sections: string[] = []
      if (km.goal) {
        sections.push(`Goal:\n  ${km.goal}`)
      }
      if (km.decisions.length > 0) {
        sections.push(
          `Decisions:\n${km.decisions.map((d) => `  - ${d}`).join('\n')}`,
        )
      }
      if (km.filesInspected.length > 0) {
        sections.push(
          `Files Inspected:\n${km.filesInspected
            .map((f) => `  - ${f}`)
            .join('\n')}`,
        )
      }
      if (km.editsMade.length > 0) {
        sections.push(
          `Edits Made:\n${km.editsMade.map((e) => `  - ${e}`).join('\n')}`,
        )
      }
      if (km.validationResults.length > 0) {
        sections.push(
          `Validation Results:\n${km.validationResults
            .map((v) => `  - ${v}`)
            .join('\n')}`,
        )
      }
      if (km.reviewReceipts.length > 0) {
        sections.push(
          `Review Receipts:\n${km.reviewReceipts
            .map((receipt) => `  - ${receipt}`)
            .join('\n')}`,
        )
      }
      if (km.blockers.length > 0) {
        sections.push(
          `Blockers:\n${km.blockers.map((b) => `  - ${b}`).join('\n')}`,
        )
      }
      if (km.nextAction) {
        sections.push(`Next Action:\n  ${km.nextAction}`)
      }
      if (sections.length === 0) return ''
      return [
        '<knowledge_memory>',
        'Pinned structured knowledge memory. Preserve verbatim across compaction; this section is not subject to normal budget cutoff.',
        ...sections,
        '</knowledge_memory>',
      ].join('\n')
    }

    function hasSubstantiveKnowledgeMemory(km: KnowledgeMemory): boolean {
      return (
        km.goal.length > 0 ||
        km.decisions.length > 0 ||
        km.filesInspected.length > 0 ||
        km.editsMade.length > 0 ||
        km.validationResults.length > 0 ||
        km.reviewReceipts.length > 0 ||
        km.blockers.length > 0 ||
        km.nextAction.length > 0
      )
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

        if (
          /^Workflow todo progress \(authoritative resumable state\):/i.test(
            trimmed,
          )
        ) {
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
          const nextActionMatch = trimmed.match(
            /^Next workflow action:\s*(.+)$/i,
          )
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

        if (/^Harness pinned active-work state/i.test(trimmed)) {
          flushWorkflowTodoLines()
          pinned.length = 0
          isInFinalResponseAllowedState = false
          finalResponseAllowedPhaseLine = ''
          addUniqueLine(pinned, trimmed)
          continue
        }

        const phaseMatch = trimmed.match(/^Current phase:\s*(\S+)/i)
        if (phaseMatch) {
          isInFinalResponseAllowedState =
            phaseMatch[1].toLowerCase() === 'final_response_allowed'
          if (isInFinalResponseAllowedState) {
            pinned.length = 0
            finalResponseAllowedPhaseLine = trimmed
          } else {
            finalResponseAllowedPhaseLine = ''
            addUniqueLine(pinned, trimmed)
          }
          continue
        }

        if (isInFinalResponseAllowedState) continue

        if (
          /^Reviewer findings from (?:code-reviewer|security-reviewer):/i.test(
            trimmed,
          )
        ) {
          addUniqueLine(pinned, trimmed)
          continue
        }

        if (isActionableReviewerLine(trimmed)) {
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
          /^(Open reviewer blockers\/feedback|Open reviewer finding records|RF-\d+-[a-f0-9]+\s+\[|Every repair edit must explicitly address|Role: root orchestrator|Pending validation\/reviewer gate files:|Last validation summary:|Next required action:)/i.test(
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
      const withoutPinnedState = text
        .replace(
          /<pinned_active_work_state>[\s\S]*?<\/pinned_active_work_state>\n*/g,
          '',
        )
        .replace(/<knowledge_memory>[\s\S]*?<\/knowledge_memory>\n*/g, '')
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
          /^(Harness pinned active-work state|Open reviewer blockers\/feedback|Open reviewer finding records|RF-\d+-[a-f0-9]+\s+\[|Every repair edit must explicitly address|Role: root orchestrator|Current phase:|Pending validation\/reviewer gate files:|Historical changed files:|Historical touched files:|Latest work summary:|Last validation summary:|Next required action:|Todos:|Remaining:)/i.test(
            trimmed,
          ) ||
          isActionableReviewerLine(trimmed) ||
          /^(?:[-*]\s*)?NON_BLOCKING\b/i.test(trimmed) ||
          /^Reviewer findings from (?:code-reviewer|security-reviewer):/i.test(
            trimmed,
          ) ||
          /^Open questions?\s*\(block/i.test(trimmed) ||
          /^[-*]\s*Q\d+\b\s*[:\u2014-]/i.test(trimmed)

        if (
          /^Workflow todo progress \(authoritative resumable state\):/i.test(
            trimmed,
          )
        ) {
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
      role: 'user' | 'assistant_tool' | 'tool_facts'
      parts: string[]
    }> = []
    const pinnedActiveWorkLines = extractPinnedActiveWorkState(
      previousSummaryContent,
    )

    // M5: Initialize structured knowledge memory from previous summary
    const knowledgeMemory = extractPreviousKnowledgeMemory()
    const persistedTaskMemory =
      params?.taskMemory &&
      typeof params.taskMemory === 'object' &&
      params.taskMemory.schemaVersion === 1
        ? params.taskMemory
        : undefined
    if (persistedTaskMemory) {
      if (typeof persistedTaskMemory.goal === 'string') {
        knowledgeMemory.goal = persistedTaskMemory.goal
      }
      for (const [source, target] of [
        [persistedTaskMemory.decisions, knowledgeMemory.decisions],
        [persistedTaskMemory.filesInspected, knowledgeMemory.filesInspected],
        [persistedTaskMemory.editsMade, knowledgeMemory.editsMade],
        [
          persistedTaskMemory.validationResults,
          knowledgeMemory.validationResults,
        ],
        [persistedTaskMemory.reviewReceipts, knowledgeMemory.reviewReceipts],
        [persistedTaskMemory.blockers, knowledgeMemory.blockers],
      ] as Array<[unknown, string[]]>) {
        if (!Array.isArray(source)) continue
        for (const entry of source) {
          if (typeof entry === 'string') addUniqueEntry(target, entry)
        }
      }
      if (
        Array.isArray(persistedTaskMemory.nextActions) &&
        typeof persistedTaskMemory.nextActions.at(-1) === 'string'
      ) {
        knowledgeMemory.nextAction = persistedTaskMemory.nextActions.at(-1)
      }
    }
    knowledgeMemory.goal = extractGoalFromMessages() || knowledgeMemory.goal
    knowledgeMemory.nextAction = extractNextActionFromRuntimeState(
      pinnedActiveWorkLines,
    )

    const toolResultValuesByCallId = new Map<string, unknown[]>()
    const toolInputsByCallId = new Map<
      string,
      { toolName: string; input: Record<string, unknown> }
    >()
    for (const message of messagesToSummarize) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (
            part.type === 'tool-call' &&
            typeof part.toolCallId === 'string'
          ) {
            toolInputsByCallId.set(part.toolCallId, {
              toolName: String(part.toolName),
              input:
                part.input && typeof part.input === 'object'
                  ? (part.input as Record<string, unknown>)
                  : {},
            })
          }
        }
      }
      if (message.role !== 'tool') continue
      const toolMessage = message as ToolMessage
      const values = toolResultValuesByCallId.get(toolMessage.toolCallId) ?? []
      if (Array.isArray(toolMessage.content)) {
        for (const part of toolMessage.content) {
          if (part.type === 'json' && 'value' in part) values.push(part.value)
        }
      }
      toolResultValuesByCallId.set(toolMessage.toolCallId, values)
    }

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
              for (const line of extractActiveWorkLines(
                rawTextWithoutThinkTags,
              )) {
                addUniqueLine(pinnedActiveWorkLines, line)
              }
              // M5: Extract decisions and blockers from assistant text
              for (const decision of extractDecisionsFromAssistantText(
                rawTextWithoutThinkTags,
              )) {
                addUniqueEntry(knowledgeMemory.decisions, decision)
              }
              for (const blocker of extractBlockersFromText(
                rawTextWithoutThinkTags,
              )) {
                addUniqueEntry(knowledgeMemory.blockers, blocker)
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
              const resultValues =
                toolResultValuesByCallId.get(part.toolCallId as string) ?? []
              toolSummaries.push(summarizeToolCall(toolName, input))
              // M5: Record inspection facts only after the matching tool result
              // proves the call succeeded. Failed/missing results remain tool
              // facts below but must not become durable "Files Inspected" state.
              if (FILE_INSPECTION_TOOLS.includes(toolName)) {
                const paths =
                  toolName === 'read_files'
                    ? getSuccessfulReadPaths(input, resultValues)
                    : hasFailureMarker(resultValues) ||
                        resultValues.length === 0
                      ? []
                      : getInspectionPaths(toolName, input)
                for (const p of paths) {
                  if (typeof p === 'string' && p.trim()) {
                    addUniqueEntry(knowledgeMemory.filesInspected, p.trim())
                  }
                }
              }
              // M5: Likewise, an edit attempt is not an edit made. Require a
              // matching success result before persisting changed paths.
              if (EDIT_TOOLS.includes(toolName)) {
                for (const path of getConfirmedMutationPaths(resultValues)) {
                  addUniqueEntry(
                    knowledgeMemory.editsMade,
                    `${path}: ${toolName}`,
                  )
                }
              }
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
        const resultValues =
          toolResultValuesByCallId.get(toolMessage.toolCallId) ?? []
        const failureText = summarizeToolFailure(resultValues)
        if (failureText) {
          entryParts.push(
            `Tool error from ${toolMessage.toolName}: ${failureText}`,
          )
        }

        if (Array.isArray(toolMessage.content)) {
          for (const part of toolMessage.content) {
            if (part.type === 'json' && part.value) {
              const value = part.value as Record<string, unknown>

              if (
                toolMessage.toolName === 'run_terminal_command' &&
                'exitCode' in value
              ) {
                const exitCode = value.exitCode as number
                if (exitCode !== 0) {
                  entryParts.push(`Command failed with exit code: ${exitCode}`)
                }
                // M5: Record validation result
                const command =
                  typeof value.command === 'string' ? value.command : ''
                const commandSummary =
                  command.length > 80 ? command.slice(0, 77) + '...' : command
                addUniqueEntry(
                  knowledgeMemory.validationResults,
                  `${commandSummary || toolMessage.toolName}: exit ${exitCode}`,
                )
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

              if (EDIT_TOOLS.includes(toolMessage.toolName)) {
                const resultStr = JSON.stringify(value)
                const truncatedResult = truncateLongText(
                  resultStr,
                  EDIT_RESULT_DETAIL_CHARS,
                )
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
              const reviewerResults = agentResults.filter(
                (r) =>
                  r.agentType && REVIEWER_AGENT_TYPES.includes(r.agentType),
              )
              const filePickerFacts = agentResults
                .filter((result) => result.agentType === 'file-picker')
                .flatMap((result) =>
                  extractFilePickerFacts(result.value?.value),
                )
                .slice(0, 12)
              for (const fact of filePickerFacts) {
                addUniqueEntry(
                  knowledgeMemory.filesInspected,
                  `${fact.path}: ${truncateLongText(
                    fact.summary,
                    KNOWLEDGE_MEMORY_FILE_FINDING_CHARS,
                  )} (discovered by file-picker)`,
                )
              }
              if (filePickerFacts.length > 0) {
                entryParts.push(
                  `File-picker discoveries:\n${filePickerFacts
                    .map(
                      (fact) =>
                        `- ${fact.path}: ${truncateLongText(
                          fact.summary,
                          KNOWLEDGE_MEMORY_FILE_FINDING_CHARS,
                        )}`,
                    )
                    .join('\n')}`,
                )
              }
              for (const reviewerResult of reviewerResults) {
                const receipt = formatStructuredReviewReceipt(
                  reviewerResult.agentType ?? 'reviewer',
                  reviewerResult.value?.value,
                )
                const findingSummary = extractReviewerFindingSummary(
                  reviewerResult.value?.value,
                )
                if (receipt) {
                  addUniqueEntry(knowledgeMemory.reviewReceipts, receipt)
                  entryParts.push(`Review receipt: ${receipt}`)
                }
                const structured = findStructuredReviewerOutput(
                  reviewerResult.value?.value,
                )
                const staleSnapshot = isStaleSnapshotReviewerOutput(
                  reviewerResult.value?.value,
                )
                const verdict =
                  typeof structured?.verdict === 'string'
                    ? structured.verdict.trim().toUpperCase()
                    : ''
                if (staleSnapshot) {
                  addUniqueEntry(
                    knowledgeMemory.validationResults,
                    `${reviewerResult.agentType}: stale snapshot review discarded; refresh the review bundle before retrying.`,
                  )
                }
                if (
                  findingSummary &&
                  !staleSnapshot &&
                  (verdict === 'BLOCKING' || structured === null)
                ) {
                  addUniqueEntry(
                    knowledgeMemory.blockers,
                    `${reviewerResult.agentType}: ${findingSummary}`,
                  )
                  entryParts.push(
                    `Reviewer findings from ${reviewerResult.agentType}:\n${truncateLongText(
                      findingSummary,
                      REVIEWER_RESULT_LIMIT,
                    )}`,
                  )
                }
              }
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

        if (toolMessage.toolName === 'spawn_agent_inline') {
          const spawnCall = toolInputsByCallId.get(toolMessage.toolCallId)
          const agentType =
            typeof spawnCall?.input.agent_type === 'string'
              ? spawnCall.input.agent_type
              : 'inline-reviewer'
          const receipt = formatStructuredReviewReceipt(agentType, resultValues)
          if (receipt) {
            addUniqueEntry(knowledgeMemory.reviewReceipts, receipt)
            entryParts.push(`Review receipt: ${receipt}`)
            const structured = findStructuredReviewerOutput(resultValues)
            const staleSnapshot = isStaleSnapshotReviewerOutput(resultValues)
            if (staleSnapshot) {
              addUniqueEntry(
                knowledgeMemory.validationResults,
                `${agentType}: stale snapshot review discarded; refresh the review bundle before retrying.`,
              )
            }
            if (
              !staleSnapshot &&
              typeof structured?.verdict === 'string' &&
              structured.verdict.trim().toUpperCase() === 'BLOCKING'
            ) {
              const findingSummary = extractReviewerFindingSummary(resultValues)
              if (findingSummary) {
                addUniqueEntry(
                  knowledgeMemory.blockers,
                  `${agentType}: ${findingSummary}`,
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
          for (const line of extractActiveWorkLines(joinedToolEntry)) {
            addUniqueLine(pinnedActiveWorkLines, line)
          }
          // M6 (SPEC R7): tool results get a reserved 'tool_facts' budget
          // independent of role, so operational memory survives compaction.
          summarizedEntries.push({
            role: 'tool_facts',
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

    // Phase 2: Walk backwards through all entries to apply token budgets.
    // M6 (SPEC R7): three independent budgets — user text, assistant text +
    // tool-call summaries, and a reserved tool-facts slice for tool results.
    let assistantToolTokens = 0
    let userTokens = 0
    let toolFactsTokens = 0
    const includeEntry = new Array(allEntries.length).fill(false)

    for (let i = allEntries.length - 1; i >= 0; i--) {
      const entry = allEntries[i]
      const entryText = entry.parts.join('\n\n---\n\n')
      const entryTokens = Math.ceil(entryText.length / CHARS_PER_TOKEN)

      if (entry.role === 'user') {
        if (userTokens + entryTokens > userBudget) {
          continue
        }
        userTokens += entryTokens
      } else if (entry.role === 'tool_facts') {
        if (toolFactsTokens + entryTokens > toolFactsBudget) {
          continue
        }
        toolFactsTokens += entryTokens
      } else {
        if (assistantToolTokens + entryTokens > assistantToolBudget) {
          continue
        }
        assistantToolTokens += entryTokens
      }
      includeEntry[i] = true
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

    // M5: Emit structured knowledge memory block, pinned verbatim across compaction
    enforceKnowledgeMemoryBudgets(knowledgeMemory)
    const knowledgeMemoryBlock = buildKnowledgeMemoryBlock(knowledgeMemory)
    if (knowledgeMemoryBlock) {
      summaryParts.push(knowledgeMemoryBlock)
    }

    for (let i = 0; i < allEntries.length; i++) {
      if (includeEntry[i]) summaryParts.push(...allEntries[i].parts)
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
      keepDuringTruncation:
        hasSubstantivePinnedActiveWork || knowledgeMemoryBlock.length > 0,
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

    const memoryEvidence = Array.isArray(persistedTaskMemory?.evidence)
      ? persistedTaskMemory.evidence.slice(-192)
      : []
    const memoryEvidenceKeys = new Set(
      memoryEvidence
        .filter((entry: unknown) => entry && typeof entry === 'object')
        .map((entry: Record<string, unknown>) => String(entry.id ?? '')),
    )
    const addMemoryEvidence = (
      kind: string,
      summary: string,
      path?: string,
    ) => {
      const normalized = summary.trim()
      if (!normalized) return
      let hash = 2166136261
      const identity = `${kind}\n${path ?? ''}\n${normalized}`
      for (let index = 0; index < identity.length; index += 1) {
        hash ^= identity.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      const id = `memory-${kind}-${(hash >>> 0).toString(16)}`
      if (memoryEvidenceKeys.has(id)) return
      memoryEvidenceKeys.add(id)
      memoryEvidence.push({
        id,
        kind,
        summary: truncateLongText(normalized, 2_000),
        ...(path ? { path } : {}),
        verifiedAt: now,
        ...(typeof params?.workspaceState?.revision === 'number'
          ? { workspaceRevision: params.workspaceState.revision }
          : {}),
      })
    }
    for (const value of knowledgeMemory.decisions) {
      addMemoryEvidence('decision', value)
    }
    for (const value of knowledgeMemory.filesInspected) {
      addMemoryEvidence('read', value, value.split(':')[0]?.trim())
    }
    for (const value of knowledgeMemory.editsMade) {
      addMemoryEvidence('edit', value, value.split(':')[0]?.trim())
    }
    for (const value of knowledgeMemory.validationResults) {
      addMemoryEvidence('validation', value)
    }
    for (const value of knowledgeMemory.reviewReceipts) {
      addMemoryEvidence('review', value)
    }
    for (const value of knowledgeMemory.blockers) {
      addMemoryEvidence('blocker', value)
    }

    yield {
      toolName: 'set_messages',
      input: {
        messages: finalMessages,
        expectedTaskMemoryRevision:
          typeof persistedTaskMemory?.revision === 'number'
            ? persistedTaskMemory.revision
            : -1,
        taskMemory: {
          schemaVersion: 1,
          goal: knowledgeMemory.goal,
          requirements: Array.isArray(persistedTaskMemory?.requirements)
            ? persistedTaskMemory.requirements
            : [],
          decisions: knowledgeMemory.decisions,
          filesInspected: knowledgeMemory.filesInspected,
          editsMade: knowledgeMemory.editsMade,
          validationResults: knowledgeMemory.validationResults,
          reviewReceipts: knowledgeMemory.reviewReceipts,
          blockers: knowledgeMemory.blockers,
          nextActions: knowledgeMemory.nextAction
            ? [knowledgeMemory.nextAction]
            : [],
          historicalSummary: truncateLongText(summaryText, 24_000),
          evidence: memoryEvidence.slice(-256),
          ...(typeof params?.workspaceState?.revision === 'number'
            ? { workspaceRevision: params.workspaceState.revision }
            : {}),
          ...(typeof params?.workspaceState?.snapshotId === 'string'
            ? { workspaceSnapshotId: params.workspaceState.snapshotId }
            : {}),
        },
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_messages'>
  },
}

export default definition
