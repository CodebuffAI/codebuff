import { retrieveAndDecryptApiKey } from 'common/api-keys/crypto'
import {
  claudeModels,
  CostMode,
  GeminiModel,
  geminiModels,
  openaiModels,
} from 'common/constants'
import { Message } from 'common/types/message'
import { APIError } from 'openai'

import { logger } from '../util/logger'
import { messagesWithSystem } from '../util/messages'
import { promptClaude, promptClaudeStream, System } from './claude'
import { promptGemini, promptGeminiStream } from './gemini-api'
import {
  promptGemini as promptVertexGemini,
  promptGeminiStream as promptVertexGeminiStream,
} from './gemini-vertex-api'
import { promptOpenRouterStream } from './open-router'
import { OpenAIMessage, promptOpenAI } from './openai-api'

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
export async function promptGeminiWithFallbacks(
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
  }
): Promise<string> {
  const { costMode, useGPT4oInsteadOfClaude, ...geminiOptions } = options

  try {
    // First try Gemini
    return await promptGemini(
      system
        ? messagesWithSystem(messages, system)
        : (messages as OpenAIMessage[]),
      geminiOptions
    )
  } catch (error) {
    logger.error(
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
      logger.error(
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
 * Streams a response from Gemini 2.5 Pro with multiple fallback strategies, including Claude Sonnet.
 *
 * Attempts the following endpoints in order until one succeeds:
 * 1. OpenRouter (Internal Key, Free Tier)
 * 2. Gemini API (Internal Key)
 * 3. Vertex AI Gemini
 * 4. Gemini API (User's Key, if available)
 * 5. Claude Sonnet (Final Fallback)
 *
 * This function handles streaming requests and yields chunks of the response as they arrive.
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
  }
): AsyncGenerator<string, void, any> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxTokens,
    temperature,
  } = options

  const formattedMessages = system
    ? messagesWithSystem(messages, system)
    : (messages as OpenAIMessage[])

  // 1. Try OpenRouter Stream
  const openRouterOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: 'google/gemini-2.5-pro-exp-03-25:free',
    temperature,
  }
  try {
    logger.debug('Attempting Gemini 2.5 Pro via OpenRouter Stream')
    yield* promptOpenRouterStream(formattedMessages, openRouterOptions)
    return // Success
  } catch (error) {
    logger.error(
      { error },
      'Error calling Gemini 2.5 Pro via OpenRouter Stream, falling back to Gemini API Stream (Internal Key)'
    )
  }

  // 2. Try Gemini API Stream (Internal Key)
  const geminiOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro,
    maxTokens,
    temperature,
  }
  try {
    logger.debug(
      'Attempting Gemini 2.5 Pro via Gemini API Stream (Internal Key)'
    )
    yield* promptGeminiStream(formattedMessages, geminiOptions) // Uses internal key by default
    return // Success
  } catch (error) {
    logger.error(
      { error },
      'Error calling Gemini 2.5 Pro via Gemini API Stream (Internal Key), falling back to Vertex AI'
    )
  }

  // 3. Try Vertex AI Gemini Stream
  const vertexGeminiOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro,
    maxTokens,
    temperature,
  }
  try {
    logger.debug('Attempting Gemini 2.5 Pro via Vertex AI Gemini Stream')
    yield* promptVertexGeminiStream(
      messages as OpenAIMessage[],
      system,
      vertexGeminiOptions
    )
    return // Success
  } catch (error) {
    logger.error(
      { error },
      'Error calling Gemini 2.5 Pro via Vertex AI Gemini Stream, falling back to User Key if available'
    )
  }

  // 4. Try User's Gemini Key if available
  let userApiKey: string | null = null
  if (userId) {
    try {
      userApiKey = await retrieveAndDecryptApiKey(userId, 'gemini')
    } catch (keyRetrievalError) {
      logger.warn(
        { error: keyRetrievalError, userId },
        'Failed to retrieve or decrypt user Gemini key. Proceeding to Claude fallback.'
      )
      // Don't throw, proceed to Claude
    }
  } else {
    logger.warn(
      'No userId provided, cannot attempt user key fallback. Proceeding to Claude fallback.'
    )
  }

  // If we have a userApiKey, attempt the final fallback using it
  if (userApiKey) {
    try {
      logger.debug('Attempting Gemini 2.5 Pro via Gemini API Stream (User Key)')
      yield* promptGeminiStream(formattedMessages, {
        ...geminiOptions,
        apiKey: userApiKey,
      })
      return // Success! The user key worked.
    } catch (userKeyError) {
      // Check if the error is a rate limit error (429)
      if (userKeyError instanceof APIError && userKeyError.status === 429) {
        logger.warn(
          { userId },
          'User Gemini API key hit rate limit. Yielding notification and falling back to Claude Sonnet.'
        )
        // Yield the special message for the client. This will be parsed out of the messages.
        yield '<codebuff_rate_limit_info>Your Gemini API key seems to have hit a rate limit. Falling back to Claude.</codebuff_rate_limit_info>'
      } else {
        // Log other errors normally
        logger.error(
          { error: userKeyError },
          'Error calling Gemini 2.5 Pro via Gemini API Stream (User Key). Falling back to Claude Sonnet.'
        )
      }
      // Proceed to Claude fallback regardless of the error type here
    }
  } else {
    logger.warn(
      { userId },
      'User Gemini key not found or retrieval failed. Proceeding to Claude fallback.'
    )
    yield `<codebuff_no_user_key_info>
Make sure to provide your Gemini API key to get longer access to Gemini 2.5 Pro! Falling back to Claude for now.
1. Go to https://aistudio.google.com/apikey and create an API key
2. Paste your key here
</codebuff_no_user_key_info>`
  }

  // 5. Final Fallback: Claude Sonnet
  try {
    logger.debug('Attempting final fallback to Claude Sonnet Stream')
    yield* promptClaudeStream(messages, {
      // Use original messages for Claude
      model: claudeModels.sonnet,
      system,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxTokens,
      // Temperature might differ, using Claude's default or a standard value
    })
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
