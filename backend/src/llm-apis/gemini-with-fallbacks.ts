import {
  claudeModels,
  CostMode,
  finetunedVertexModels,
  GeminiModel,
  geminiModels,
  openaiModels,
} from 'common/constants'
import { Message } from 'common/types/message'
import { CoreMessage } from 'ai'
import { logger } from '../util/logger'
import { promptAiSdk, promptAiSdkStream, transformMessages as transformToCoreMessages } from './vercel-ai-sdk/ai-sdk'
import { System } from './claude'
import { promptClaudeStream } from './claude'

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
    repositoryUrl?: string
    maxTokens?: number
    temperature?: number
    costMode?: CostMode
    useGPT4oInsteadOfClaude?: boolean
    thinkingBudget?: number
    useFinetunedModel?: boolean
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
        { model: finetunedVertexModels.ft_filepicker_005 },
        'Using finetuned model for file-picker!'
      )
      return await promptAiSdk({
        ...geminiOptions,
        messages,
        model: finetunedVertexModels.ft_filepicker_005,
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

/**
 * Streams a response from Gemini 2.5 Pro with multiple fallback strategies.
 *
 * Attempts the following endpoints in order until one succeeds:
 * 1. Gemini API (Internal Key - gemini-2.5-pro-exp)
 * 2. OpenRouter (Internal Key - google/gemini-2.5-pro-exp-03-25:free)
 * 3. OpenRouter (Internal Key - google/gemini-2.5-pro-preview-03-25)
 * 4. Claude Sonnet (Final Fallback)
 *
 * This function handles streaming requests and yields chunks of the response as they arrive.
 * If a stream fails mid-way (e.g., due to rate limits), it appends the partially
 * generated content to the message history before attempting the next fallback.
 *
 * @param messages - The array of messages forming the conversation history.
 * @param system - An optional system prompt string or array of text blocks.
 * @param options - Configuration options for the API call.
 * @param options.clientSessionId - Unique ID for the client session.
 * @param options.fingerprintId - Unique ID for the user's device/fingerprint.
 * @param options.userInputId - Unique ID for the specific user input triggering this call.
 * @param options.userId - The ID of the user making the request (required for user key fallback).
 * @param options.maxTokens - Optional maximum number of tokens for the response.
 * @param options.temperature - Optional temperature setting for generation (0-1).
 * @yields {string} Chunks of the generated response text.
 * @throws If all fallback attempts fail.
 */
export async function* streamGemini25ProWithFallbacks(
  messages: Message[],
  system: System | undefined,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    repositoryUrl?: string
    maxTokens?: number
    temperature?: number
    stopSequences?: string[]
    thinkingBudget?: number
  }
): AsyncGenerator<string, void, any> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repositoryUrl,
    maxTokens,
    temperature,
    stopSequences,
    thinkingBudget,
  } = options

  // Transform messages to CoreMessage format for Vercel AI SDK
  let currentMessages: CoreMessage[]
  if (system) {
    const systemContentString = typeof system === 'string' ? system : system.map(block => block.text).join('\n');
    const messagesWithSystemForTransform = [{ role: 'system' as const, content: systemContentString }, ...messages];
    currentMessages = transformToCoreMessages(messagesWithSystemForTransform, geminiModels.gemini2_5_flash)
  } else {
    currentMessages = transformToCoreMessages(messages, geminiModels.gemini2_5_flash)
  }

  // Try Gemini API Stream (Internal Key - gemini-2.5-pro-preview)
  const geminiPreviewOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro_preview, // Preview model via Gemini API
    maxTokens,
    temperature,
    stopSequences,
    thinkingBudget,
    messages: currentMessages, // Add messages to the options object
    repositoryUrl, // Add repositoryUrl to the options object
  }
  try {
    for await (const chunk of promptAiSdkStream(
      geminiPreviewOptions // Pass the single options object
    )) {
      yield chunk
    }
    return // Success
  } catch (error) {
    logger.warn(
      { error },
      'Error calling Gemini 2.5 Pro (preview) via Gemini API Stream (Internal Key)'
    )
  }

  // Final Fallback: Claude Sonnet
  logger.debug('Attempting final fallback to Claude Sonnet Stream')
  try {
    for await (const chunk of promptClaudeStream(messages, {
      model: claudeModels.sonnet,
      system,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repositoryUrl,
      maxTokens,
      stopSequences,
      // Temperature might differ, using Claude's default or a standard value
    })) {
      yield chunk
    }
    return // Success! Claude Sonnet worked.
  } catch (claudeError) {
    logger.error(
      { error: claudeError },
      'Error calling Claude Sonnet Stream. All fallbacks failed.'
    )
    // Throw the Claude error as it's the very last thing that failed
    throw claudeError
  }
}
