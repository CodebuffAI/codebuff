import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { getChatApiKey, loadSdk } from './agent'
import { chatBackendModelId, truncateThreadTitle } from '@/app/chat/models'
import { logger } from '@/util/logger'

import type { AgentDefinition } from '@codebuff/sdk'

/** The model only needs the gist; truncate long first messages so the title
 *  call stays cheap and fast. */
const TITLE_INPUT_MAX_CHARS = 2000

/**
 * A throwaway, single-step agent whose only job is to emit a short topic title.
 * No tools, no subagents — one completion. Runs through the same codebuff agent
 * framework / service account as the chat itself (the completions endpoint
 * requires a real agent run, so a raw HTTP call can't be used). The model is
 * the thread's own model (MiniMax M3 for full access, DeepSeek Flash for
 * limited) so a limited user's title never silently uses a richer model. The
 * instructions deliberately keep sensitive details out of the title.
 */
function buildTitleAgent(backendModel: string): AgentDefinition {
  return {
    id: 'freebuff-chat-title',
    displayName: 'Freebuff Chat Title',
    model: backendModel as AgentDefinition['model'],
    outputMode: 'last_message',
    toolNames: [],
    spawnableAgents: [],
    inputSchema: {
      prompt: { type: 'string', description: "The user's first message." },
    },
    systemPrompt:
      'You generate short, clean titles for chat conversations. You output only the title.',
    instructionsPrompt: `Write a concise title (3-6 words) summarizing the topic of the user's message.

Rules:
- Plain text only: no surrounding quotes, no trailing punctuation, no preamble or explanation.
- Write the title in the same language as the user's message.
- Capitalize it like a headline (when the language uses capitalization).
- Describe what the message is *about*, in general terms. Never copy sensitive personal data into the title — names, emails, phone numbers, addresses, API keys, passwords, or other secrets. Summarize the topic, not the private details.
- If the message is just a greeting or too vague to summarize, output a short generic title like "New conversation" (in the message's language).

Output only the title.`,
  }
}

/** Cleans up the model's raw output into a single-line, quote-free, length-
 *  bounded title. Returns null when nothing usable is left. */
function sanitizeTitle(raw: string): string | null {
  let title = raw.replace(/\s+/g, ' ').trim()
  // A "Title:" label the model sometimes prepends despite instructions.
  title = title.replace(/^title:\s*/i, '').trim()
  // Surrounding quotes (straight or curly).
  title = title.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
  // Trailing sentence punctuation.
  title = title.replace(/[.!?,;:]+$/g, '').trim()
  if (!title) return null
  return truncateThreadTitle(title)
}

/**
 * Generates a short, sensitive-info-free title for a chat thread from its first
 * user message. Best-effort: any failure (model error, abort, empty output)
 * resolves to null so the caller keeps the prompt-prefix placeholder title.
 */
export async function generateThreadTitle(params: {
  prompt: string
  /** Chat-product model id of the thread (see CHAT_MODELS); the title uses the
   *  same model's backend so it matches the user's access tier. */
  model: string
  userId: string
  threadId: string
  signal: AbortSignal
}): Promise<string | null> {
  const start = Date.now()
  // One event per attempt, so the failure/fallback rate and added latency are
  // queryable in PostHog (see AnalyticsEvent.FREEBUFF_CHAT_TITLE_GENERATED).
  const track = (
    outcome: 'generated' | 'empty' | 'unknown_model' | 'error' | 'aborted',
    titleLength?: number,
  ) => {
    trackEvent({
      event: AnalyticsEvent.FREEBUFF_CHAT_TITLE_GENERATED,
      userId: params.userId,
      properties: {
        surface: 'chat',
        model: params.model,
        outcome,
        latencyMs: Date.now() - start,
        ...(titleLength !== undefined ? { titleLength } : {}),
      },
      logger,
    })
  }

  const input = params.prompt.trim()
  // Image-only / empty turns have nothing to summarize (no event — no attempt).
  if (!input) return null

  const backendModel = chatBackendModelId(params.model)
  if (!backendModel) {
    logger.warn(
      { model: params.model, userId: params.userId, threadId: params.threadId },
      'Chat thread title: unknown model, skipping title generation',
    )
    track('unknown_model')
    return null
  }

  try {
    const [apiKey, { run }] = await Promise.all([getChatApiKey(), loadSdk()])
    let text = ''
    await run({
      apiKey,
      fingerprintId: `freebuff-chat-title-${params.userId}`,
      agent: buildTitleAgent(backendModel),
      // No filesystem and no subagents: this is a one-shot completion.
      projectFiles: {},
      knowledgeFiles: {},
      maxAgentSteps: 1,
      prompt: input.slice(0, TITLE_INPUT_MAX_CHARS),
      costMode: 'normal',
      signal: params.signal,
      extraCodebuffMetadata: {
        freebuff_chat_user_id: params.userId,
        freebuff_chat_thread_id: params.threadId,
      },
      handleStreamChunk: (chunk) => {
        // String chunks are the agent's text deltas; reasoning arrives as
        // objects and is ignored here.
        if (typeof chunk === 'string') text += chunk
      },
    })
    const title = sanitizeTitle(text)
    track(title ? 'generated' : 'empty', title?.length)
    return title
  } catch (error) {
    if (!params.signal.aborted) {
      logger.warn(
        { error, userId: params.userId, threadId: params.threadId },
        'Chat thread title generation failed',
      )
    }
    track(params.signal.aborted ? 'aborted' : 'error')
    return null
  }
}
