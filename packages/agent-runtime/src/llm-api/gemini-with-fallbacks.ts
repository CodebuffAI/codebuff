import { openaiModels, openrouterModels } from '@codebuff/common/old-constants'

import type {
  CostMode,
  FinetunedVertexModel,
} from '@codebuff/common/old-constants'
import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

/**
 * Prompts a Gemini model with fallback logic.
 *
 * Attempts to call the specified Gemini model via the standard Gemini API.
 * If that fails, it falls back to using the Vertex AI Gemini endpoint.
 * If Vertex AI also fails, it falls back to either GPT-4o (if `useGPT4oInsteadOfClaude` is true)
 * or a Claude model (Sonnet for 'max' costMode, Haiku otherwise).
 *
 * This function handles non-streaming requests and returns the complete response string.
 *
 * @param messages - The array of messages forming the conversation history.
 * @param system - An optional system prompt string or array of text blocks.
 * @param options - Configuration options for the API call.
 * @param options.clientSessionId - Unique ID for the client session.
 * @param options.fingerprintId - Unique ID for the user's device/fingerprint.
 * @param options.userInputId - Unique ID for the specific user input triggering this call.
 * @param options.model - The primary Gemini model to attempt.
 * @param options.userId - The ID of the user making the request.
 * @param options.maxTokens - Optional maximum number of tokens for the response.
 * @param options.temperature - Optional temperature setting for generation (0-1).
 * @param options.costMode - Optional cost mode ('lite', 'normal', 'max') influencing fallback model choice.
 * @param options.useGPT4oInsteadOfClaude - Optional flag to use GPT-4o instead of Claude as the final fallback.
 * @returns A promise that resolves to the complete response string from the successful API call.
 * @throws If all API calls (primary and fallbacks) fail.
 */
export async function promptFlashWithFallbacks(
  params: {
    messages: Message[]
    costMode?: CostMode
    useGPT4oInsteadOfClaude?: boolean
    thinkingBudget?: number
    useFinetunedModel?: FinetunedVertexModel | undefined
    promptAiSdk: PromptAiSdkFn
    logger: Logger
  } & ParamsExcluding<PromptAiSdkFn, 'messages'>,
): Promise<string> {
  const {
    messages,
    costMode,
    useGPT4oInsteadOfClaude,
    useFinetunedModel,
    promptAiSdk,
    logger,
  } = params

  // Try finetuned model first if enabled
  if (useFinetunedModel) {
    try {
      return await promptAiSdk({
        ...params,
        messages,
        model: useFinetunedModel,
      })
    } catch (error) {
      logger.warn(
        { error },
        'Error calling finetuned model, falling back to Gemini API',
      )
    }
  }

  try {
    // First try Gemini
    return await promptAiSdk({ ...params, messages })
  } catch (error) {
    logger.warn(
      { error },
      `Error calling Gemini API, falling back to ${useGPT4oInsteadOfClaude ? 'gpt-4o' : 'Claude'}`,
    )
    return await promptAiSdk({
      ...params,
      messages,
      model: useGPT4oInsteadOfClaude
        ? openaiModels.gpt4o
        : {
            lite: openrouterModels.openrouter_claude_3_5_haiku,
            normal: openrouterModels.openrouter_claude_3_5_haiku,
            max: openrouterModels.openrouter_claude_sonnet_4,
            experimental: openrouterModels.openrouter_claude_3_5_haiku,
            ask: openrouterModels.openrouter_claude_3_5_haiku,
          }[costMode ?? 'normal'],
    })
  }
}
