import { minimaxModels } from '@codebuff/common/constants/model-config'

import type { ChatCompletionRequestBody } from './types'

export const MINIMAX_M3_API_MODEL_ID = 'MiniMax-M3'

// NOTE: minimax/minimax-m3 is intentionally routed through Fireworks
// (see FIREWORKS_MODEL_MAP in fireworks.ts) rather than the official MiniMax
// API. Leaving this map empty means isMiniMaxModel() returns false for it, so
// getChatCompletionsProvider() falls through to the Fireworks provider.
export const MINIMAX_MODEL_IDS: Record<string, string> = {}

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
