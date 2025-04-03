import { retrieveAndDecryptApiKey } from 'common/api-keys/crypto'
import {
  claudeModels,
  CostMode,
  GeminiModel,
  geminiModels,
  openaiModels,
} from 'common/constants'
import { Message } from 'common/types/message'

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
  let vertexError: unknown
  try {
    logger.debug('Attempting Gemini 2.5 Pro via Vertex AI Gemini Stream')
    yield* promptVertexGeminiStream(
      messages as OpenAIMessage[],
      system,
      vertexGeminiOptions
    )
    return // Success
  } catch (error) {
    vertexError = error // Store the error for potential re-throw
    logger.error(
      { error },
      'Error calling Gemini 2.5 Pro via Vertex AI Gemini Stream, falling back to User Key if available'
    )
  }

  // 4. Try User's Gemini Key if available
  if (!userId) {
    logger.warn('No userId provided, cannot attempt user key fallback.')
    // Throw the error from the previous step (Vertex) or a generic one if Vertex didn't run/error
    throw vertexError ?? new Error('All fallbacks failed, no user ID provided.')
  }

  // Attempt to retrieve and decrypt the user's API key
  let userApiKey: string | null = null
  try {
    userApiKey = await retrieveAndDecryptApiKey(userId, 'gemini')
  } catch (keyRetrievalError) {
    logger.error(
      { error: keyRetrievalError, userId },
      'Failed to retrieve or decrypt user Gemini key.'
    )
    // If key retrieval fails, we can't proceed. Throw the Vertex error or a generic one.
    throw (
      vertexError ??
      new Error('All fallbacks failed, including user key retrieval.')
    )
  }

  // Guard clause: Check if the API key was actually found
  if (!userApiKey) {
    logger.warn(
      { userId },
      'User Gemini key not found in DB, cannot use as fallback.'
    )
    // If no key found, throw the Vertex error or a generic one.
    throw vertexError ?? new Error('All fallbacks failed, user key not found.')
  }

  // If we have a userApiKey, attempt the final fallback using it
  try {
    logger.debug('Attempting Gemini 2.5 Pro via Gemini API Stream (User Key)')
    yield* promptGeminiStream(formattedMessages, {
      ...geminiOptions,
      apiKey: userApiKey,
    })
    return // Success! The user key worked.
  } catch (userKeyError) {
    logger.error(
      { error: userKeyError },
      'Error calling Gemini 2.5 Pro via Gemini API Stream (User Key). Falling back to Claude Sonnet.'
    )
    // If this attempt fails, try Claude Sonnet as the last resort
    try {
      logger.debug('Attempting final fallback to Claude Sonnet Stream')
      yield* promptClaudeStream(messages, { // Use original messages for Claude
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
}
