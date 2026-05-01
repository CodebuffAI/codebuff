import { endsAgentStepParam } from '@codebuff/common/tools/constants'

export const globalStopSequence = `${JSON.stringify(endsAgentStepParam)}`

/**
 * Set to `true` to log the full LLM request (system prompt, tools, messages)
 * to `debug/cache-debug/` on each user prompt. Use with:
 *   bun scripts/compare-cache-debug.ts
 * to diff sequential requests and find what's breaking prompt caching.
 */
export const CACHE_DEBUG_FULL_LOGGING = false

// Keep disabled by default to preserve mainline behavior until reasoning-token
// replay has been tested more thoroughly.
export const INCLUDE_REASONING_IN_MESSAGE_HISTORY = false
