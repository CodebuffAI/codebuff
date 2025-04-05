import { GoogleGenerativeAIError } from '@google/generative-ai'
import { retrieveAndDecryptApiKey } from 'common/api-keys/crypto'
import {
  claudeModels,
  CODEBUFF_CLAUDE_FALLBACK_INFO,
  CODEBUFF_INVALID_KEY_INFO as CODEBUFF_INVALID_GEMINI_KEY_INFO,
  CODEBUFF_RATE_LIMIT_INFO,
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
 * 1. Gemini API (User's Key, if available - gemini-2.5-pro-exp)
 * 2. OpenRouter (Internal Key, Free Tier - google/gemini-2.5-pro-exp-03-25:free)
 * 3. Vertex AI Gemini (gemini-2.5-pro-exp)
 * 4. Gemini API (Internal Key - gemini-2.5-pro-exp)
 * 5. Gemini API (Internal Key - gemini-2.5-pro-preview)
 * 6. Claude Sonnet (Final Fallback)
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

  // 1. Try User's Gemini Key if available (using gemini-2.5-pro-exp)
  const geminiExpOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro_exp,
    maxTokens,
    temperature,
  }
  let userApiKey: string | null = null
  let userKeyAttempted = false
  if (userId) {
    try {
      userApiKey = await retrieveAndDecryptApiKey(userId, 'gemini')
    } catch (keyRetrievalError) {
      logger.warn(
        { error: keyRetrievalError, userId },
        'Failed to retrieve or decrypt user Gemini key. Proceeding to internal fallbacks.'
      )
    }
  } else {
    logger.warn(
      'No userId provided, cannot attempt user key. Proceeding to internal fallbacks.'
    )
  }

  if (userApiKey) {
    userKeyAttempted = true
    try {
      logger.debug(
        'Attempting Gemini 2.5 Pro (exp) via Gemini API Stream (User Key)'
      )
      yield* promptGeminiStream(formattedMessages, {
        ...geminiExpOptions,
        apiKey: userApiKey,
      })
      return // Success! The user key worked.
    } catch (userKeyError) {
      if (
        userKeyError instanceof GoogleGenerativeAIError &&
        (userKeyError as any)?.errorDetails?.some(
          (detail: any) => detail?.reason === 'API_KEY_INVALID'
        )
      ) {
        logger.warn({ userId }, 'User Gemini API key is invalid.')
        yield `<${CODEBUFF_INVALID_GEMINI_KEY_INFO}>Your Gemini API key is invalid. Please check your API key and try again.</${CODEBUFF_INVALID_GEMINI_KEY_INFO}>\n`
      } else if (
        userKeyError instanceof GoogleGenerativeAIError &&
        (userKeyError as any)?.status === 429
      ) {
        logger.warn(
          { userId },
          'User Gemini API key hit rate limit. Yielding notification and falling back to internal keys.'
        )
        yield `<${CODEBUFF_RATE_LIMIT_INFO}>Your Gemini API key seems to have hit a rate limit. Falling back to internal keys.</${CODEBUFF_RATE_LIMIT_INFO}>\n`
      } else {
        logger.warn(
          { error: userKeyError },
          'Error calling Gemini 2.5 Pro (exp) via Gemini API Stream (User Key). Falling back to internal keys.'
        )
      }
    }
  } else if (userId && !userKeyAttempted) {
    logger.warn(
      { userId },
      'User Gemini key not found or retrieval failed. Proceeding to internal fallbacks.'
    )
  }

  // --- Internal Fallbacks ---

  // 2. Try OpenRouter Stream (google/gemini-2.5-pro-exp-03-25:free)
  const openRouterOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: 'google/gemini-2.5-pro-exp-03-25:free',
    temperature,
  }
  try {
    logger.debug('Attempting Gemini 2.5 Pro (exp) via OpenRouter Stream')
    yield* promptOpenRouterStream(formattedMessages, openRouterOptions)
    return // Success
  } catch (error) {
    logger.warn(
      { error },
      'Error calling Gemini 2.5 Pro (exp) via OpenRouter Stream, falling back to Vertex AI'
    )
  }

  // 3. Try Vertex AI Gemini Stream (gemini-2.5-pro-exp)
  const vertexGeminiOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro_exp,
    maxTokens,
    temperature,
  }
  try {
    logger.debug('Attempting Gemini 2.5 Pro (exp) via Vertex AI Gemini Stream')
    yield* promptVertexGeminiStream(
      messages as OpenAIMessage[],
      system,
      vertexGeminiOptions
    )
    return // Success
  } catch (error) {
    logger.warn(
      { error },
      'Error calling Gemini 2.5 Pro (exp) via Vertex AI Gemini Stream, falling back to Gemini API (preview)'
    )
  }

  // 4. Try Gemini API Stream (Internal Key - gemini-2.5-pro-exp)
  try {
    logger.debug(
      'Attempting Gemini 2.5 Pro (exp) via Gemini API Stream (Internal Key)'
    )
    yield* promptGeminiStream(formattedMessages, geminiExpOptions)
    return // Success
  } catch (error) {
    logger.warn(
      { error },
      'Error calling Gemini 2.5 Pro (exp) via Gemini API Stream (Internal Key), falling back to Gemini 2.5 Pro (preview)'
    )
  }

  // 5. Try Gemini API Stream (Internal Key - gemini-2.5-pro-preview)
  const geminiPreviewOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro_preview,
    maxTokens,
    temperature,
  }
  try {
    logger.debug(
      'Attempting Gemini 2.5 Pro (preview) via Gemini API Stream (Internal Key)'
    )
    yield* promptGeminiStream(formattedMessages, geminiPreviewOptions)
    return // Success
  } catch (error) {
    logger.warn(
      { error },
      'Error calling Gemini 2.5 Pro (preview) via Gemini API Stream (Internal Key), falling back to Claude Sonnet'
    )
    yield `<${CODEBUFF_CLAUDE_FALLBACK_INFO}>All Gemini API attempts failed. Falling back to Claude Sonnet.</${CODEBUFF_CLAUDE_FALLBACK_INFO}>\n`
  }

  // 6. Final Fallback: Claude Sonnet
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
