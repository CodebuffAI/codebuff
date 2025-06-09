import {
  claudeModels,
  CostMode,
  FinetunedVertexModel,
  GeminiModel,
  openaiModels,
} from '@codebuff/common/constants'

import { CoreMessage } from 'ai'
import { logger } from '../util/logger'
import { promptAiSdk } from './vercel-ai-sdk/ai-sdk'

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
  messages: CoreMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: GeminiModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
    costMode?: CostMode
    useGPT4oInsteadOfClaude?: boolean
    thinkingBudget?: number
    useFinetunedModel?: FinetunedVertexModel | undefined
  }
): Promise<string> {
  const {
    costMode,
    useGPT4oInsteadOfClaude,
    useFinetunedModel,
    ...geminiOptions
  } = options

  // Try finetuned model first if enabled
  if (useFinetunedModel) {
    try {
      logger.info(
        { model: useFinetunedModel },
        'Using finetuned model for file-picker!'
      )
      return await promptAiSdk({
        ...geminiOptions,
        messages,
        model: useFinetunedModel,
      })
    } catch (error) {
      logger.warn(
        { error },
        'Error calling finetuned model, falling back to Gemini API'
      )
    }
  }

  try {
    // First try Gemini
    return await promptAiSdk({ ...geminiOptions, messages })
  } catch (error) {
    logger.warn(
      { error },
      `Error calling Gemini API, falling back to ${useGPT4oInsteadOfClaude ? 'gpt-4o' : 'Claude'}`
    )
    return await promptAiSdk({
      ...geminiOptions,
      messages,
      model: useGPT4oInsteadOfClaude
        ? openaiModels.gpt4o
        : {
            lite: claudeModels.haiku,
            normal: claudeModels.haiku,
            max: claudeModels.sonnet,
            experimental: claudeModels.haiku,
            ask: claudeModels.haiku,
          }[costMode ?? 'normal'],
    })
  }
}
