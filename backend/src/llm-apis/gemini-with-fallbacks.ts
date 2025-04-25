import {
  claudeModels,
  CostMode,
  finetunedVertexModels,
  GeminiModel,
  geminiModels,
  openaiModels,
} from 'common/constants'
import { Message } from 'common/types/message'

import { logger } from '../util/logger'
import { messagesWithSystem } from '../util/messages'
import { promptClaude, promptClaudeStream, System } from './claude'
import { promptGemini, promptGeminiStream } from './gemini-api'
import { promptGemini as promptVertexGemini } from './gemini-vertex-api'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { promptAiSdk_GeminiFormat } from './vercel-ai-sdk/ai-sdk'

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
  messages: Message[],
  system: System | undefined,
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
      return await promptAiSdk_GeminiFormat(
        messages as OpenAIMessage[],
        system,
        {
          ...geminiOptions,
          model: finetunedVertexModels.ft_filepicker_005,
        }
      )
    } catch (error) {
      logger.warn(
        { error },
        'Error calling finetuned model, falling back to Gemini API'
      )
    }
  }

  try {
    // First try Gemini
    return await promptGemini(
      system
        ? messagesWithSystem(messages, system)
        : (messages as OpenAIMessage[]),
      geminiOptions
    )
  } catch (error) {
    logger.warn(
      { error },
      'Error calling Gemini API, falling back to Vertex Gemini'
    )
    try {
      // Then try Vertex Gemini
      return await promptVertexGemini(
        messages as OpenAIMessage[],
        system,
        geminiOptions
      )
    } catch (error) {
      logger.warn(
        { error },
        `Error calling Vertex Gemini API, falling back to ${useGPT4oInsteadOfClaude ? 'gpt-4o' : 'Claude'}`
      )
      if (useGPT4oInsteadOfClaude) {
        return await promptOpenAI(messages as OpenAIMessage[], {
          model: openaiModels.gpt4o,
          clientSessionId: options.clientSessionId,
          fingerprintId: options.fingerprintId,
          userInputId: options.userInputId,
          userId: options.userId,
          temperature: options.temperature,
        })
      }
      // Finally fall back to Claude
      return await promptClaude(messages, {
        model: costMode === 'max' ? claudeModels.sonnet : claudeModels.haiku,
        system,
        clientSessionId: options.clientSessionId,
        fingerprintId: options.fingerprintId,
        userInputId: options.userInputId,
        userId: options.userId,
      })
    }
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
    maxTokens?: number
    temperature?: number
    stopSequences?: string[]
  }
): AsyncGenerator<string, void, any> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxTokens,
    temperature,
    stopSequences,
  } = options

  // Initialize the message list for the first attempt
  let currentMessages: OpenAIMessage[] = system
    ? messagesWithSystem(messages, system)
    : (messages as OpenAIMessage[])

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
  }
  try {
    for await (const chunk of promptGeminiStream(
      currentMessages,
      geminiPreviewOptions
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
