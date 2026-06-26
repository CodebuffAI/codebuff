import { minimaxModels } from '@codebuff/common/constants/model-config'

import type { ChatCompletionRequestBody } from './types'

export const MINIMAX_M3_API_MODEL_ID = 'MiniMax-M3'

/** Which upstream a session is pinned to for a MiniMax-family model that
 *  defaults to Fireworks serverless and falls back to the official MiniMax API:
 *  - `fireworks` — default (also the meaning of a null/absent pin)
 *  - `minimax`   — pinned to the official MiniMax API after a Fireworks rate
 *                  limit, kept sticky to preserve the warm prompt cache. */
export type MiniMaxUpstream = 'fireworks' | 'minimax'

// Maps a freebuff/OpenRouter model id to its official MiniMax API model id so
// the MiniMax handler can build a correctly-named request body and price it.
//
// NOTE: minimax/minimax-m3 normally serves from the Fireworks serverless API
// (see FIREWORKS_MODEL_MAP in fireworks.ts); the official MiniMax API is only a
// rate-limit fallback (see minimax-m3-router.ts). It is therefore listed here
// so the MiniMax handler can serve it, but kept in MINIMAX_FALLBACK_ONLY_MODELS
// so isMiniMaxModel() stays false for it and getChatCompletionsProvider() still
// routes it to Fireworks by default.
export const MINIMAX_MODEL_IDS: Record<string, string> = {
  'minimax/minimax-m3': MINIMAX_M3_API_MODEL_ID,
}

/**
 * Models that the MiniMax handler can serve but which are NOT routed to MiniMax
 * by default — they default to another upstream (Fireworks serverless) and only
 * fall back to the official MiniMax API reactively (e.g. on rate limits). Kept
 * out of the default-routing predicate `isMiniMaxModel`.
 */
export const MINIMAX_FALLBACK_ONLY_MODELS = new Set<string>([
  'minimax/minimax-m3',
])

/** True when `model` reaches MiniMax only as a reactive fallback, not as its
 *  default provider. */
export function isMiniMaxFallbackModel(model: string): boolean {
  return MINIMAX_FALLBACK_ONLY_MODELS.has(model)
}

export function getMiniMaxModelId(openrouterModel: string): string {
  return MINIMAX_MODEL_IDS[openrouterModel] ?? openrouterModel
}

function toMiniMaxThinkingType(enabled: unknown): 'adaptive' | 'disabled' {
  return enabled === false ? 'disabled' : 'adaptive'
}

export function normalizeMiniMaxRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): ChatCompletionRequestBody {
  return {
    ...body,
    model: getMiniMaxModelId(originalModel),
  }
}

export function buildMiniMaxRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): Record<string, unknown> {
  const minimaxBody = normalizeMiniMaxRequestBody(
    body,
    originalModel,
  ) as unknown as Record<string, unknown>

  if (minimaxBody.reasoning && typeof minimaxBody.reasoning === 'object') {
    const reasoning = minimaxBody.reasoning as {
      enabled?: boolean
    }
    minimaxBody.thinking = {
      type: toMiniMaxThinkingType(reasoning.enabled),
    }
  } else if (minimaxBody.reasoning_effort) {
    minimaxBody.thinking = {
      type: 'adaptive',
    }
  }
  delete minimaxBody.reasoning
  delete minimaxBody.reasoning_effort

  if (minimaxBody.reasoning_split === undefined) {
    minimaxBody.reasoning_split = true
  }

  if (
    minimaxBody.max_completion_tokens === undefined &&
    minimaxBody.max_tokens !== undefined
  ) {
    minimaxBody.max_completion_tokens = minimaxBody.max_tokens
  }
  delete minimaxBody.max_tokens

  delete minimaxBody.provider
  delete minimaxBody.transforms
  delete minimaxBody.codebuff_metadata
  delete minimaxBody.usage

  if (minimaxBody.stream) {
    minimaxBody.stream_options = { include_usage: true }
  }

  return minimaxBody
}
