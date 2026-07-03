import { endsAgentStepParam } from '@codebuff/common/tools/constants'

export const globalStopSequence = `${JSON.stringify(endsAgentStepParam)}`

/**
 * Set to `true` to log the full LLM request (system prompt, tools, messages)
 * to `debug/cache-debug/` on each user prompt. Use with:
 *   bun scripts/compare-cache-debug.ts
 * to diff sequential requests and find what's breaking prompt caching.
 */
export const CACHE_DEBUG_FULL_LOGGING = false

// Default for whether reasoning chunks emitted by the model are appended to
// assistant message history so they replay on the next turn. Agents can opt in
// with includeReasoningInMessageHistory when they need reasoning replay.
export const DEFAULT_INCLUDE_REASONING_IN_MESSAGE_HISTORY = false
