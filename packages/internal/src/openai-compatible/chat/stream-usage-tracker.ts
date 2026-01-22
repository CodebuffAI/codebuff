import type { LanguageModelV2Usage } from '@ai-sdk/provider';

export interface ChunkUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
    accepted_prediction_tokens?: number | null;
    rejected_prediction_tokens?: number | null;
  } | null;
}

export function createStreamUsageTracker() {
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;
  let reasoningTokens: number | undefined;
  let acceptedPredictionTokens: number | undefined;
  let rejectedPredictionTokens: number | undefined;
  let cachedTokens: number | undefined;

  return {
    update(chunkUsage: ChunkUsage): void {
      promptTokens = chunkUsage.prompt_tokens ?? undefined;
      completionTokens = chunkUsage.completion_tokens ?? undefined;
      totalTokens = chunkUsage.total_tokens ?? undefined;

      if (chunkUsage.completion_tokens_details?.reasoning_tokens != null) {
        reasoningTokens = chunkUsage.completion_tokens_details.reasoning_tokens;
      }
      if (chunkUsage.completion_tokens_details?.accepted_prediction_tokens != null) {
        acceptedPredictionTokens = chunkUsage.completion_tokens_details.accepted_prediction_tokens;
      }
      if (chunkUsage.completion_tokens_details?.rejected_prediction_tokens != null) {
        rejectedPredictionTokens = chunkUsage.completion_tokens_details.rejected_prediction_tokens;
      }
      if (chunkUsage.prompt_tokens_details?.cached_tokens != null) {
        cachedTokens = chunkUsage.prompt_tokens_details.cached_tokens;
      }
    },

    getUsage(): LanguageModelV2Usage {
      return {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        totalTokens,
        reasoningTokens,
        cachedInputTokens: cachedTokens,
      };
    },

    getCompletionTokensDetails() {
      return { reasoningTokens, acceptedPredictionTokens, rejectedPredictionTokens };
    },
  };
}

export type StreamUsageTracker = ReturnType<typeof createStreamUsageTracker>;
