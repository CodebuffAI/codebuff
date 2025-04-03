import { retrieveAndDecryptApiKey } from 'common/api-keys/crypto'
import {
  CostMode,
  GeminiModel,
  openaiModels,
  claudeModels,
  geminiModels,
} from 'common/constants'
import { Message } from 'common/types/message'

import { promptClaude, System } from './claude'
import { promptGemini, promptGeminiStream } from './gemini-api'
import {
  promptGemini as promptVertexGemini,
  promptGeminiStream as promptVertexGeminiStream,
} from './gemini-vertex-api'
import { promptOpenRouterStream } from './open-router'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { logger } from '../util/logger'
import { messagesWithSystem } from '../util/messages'

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

export async function* streamGemini25Pro(
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

  const openRouterOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: 'google/gemini-2.5-pro-exp-03-25:free',
    temperature,
  }

  const geminiOptions = {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: geminiModels.gemini2_5_pro,
    maxTokens,
    temperature,
  }

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
    // 1. Try OpenRouter Stream
    logger.debug('Attempting Gemini 2.5 Pro via OpenRouter Stream')
    yield* promptOpenRouterStream(
      system
        ? messagesWithSystem(messages, system)
        : (messages as OpenAIMessage[]),
      openRouterOptions
    )
    return // Exit successfully if OpenRouter stream works
  } catch (error) {
    logger.error(
      { error },
      'Error calling Gemini 2.5 Pro via OpenRouter Stream, falling back to Gemini API Stream'
    )
    try {
      // 2. Try Gemini API Stream (Internal Key)
      logger.debug(
        'Attempting Gemini 2.5 Pro via Gemini API Stream (Internal Key)'
      )
      const stream = promptGeminiStream(
        system
          ? messagesWithSystem(messages, system)
          : (messages as OpenAIMessage[]),
        geminiOptions // Uses internal key by default
      )
      yield* stream
      return // Exit successfully if Gemini API stream works
    } catch (geminiError) {
      logger.error(
        { error: geminiError },
        'Error calling Gemini 2.5 Pro via Gemini API Stream (Internal Key), falling back to Vertex AI'
      )
      try {
        // 3. Try Vertex AI Gemini Stream
        logger.debug('Attempting Gemini 2.5 Pro via Vertex AI Gemini Stream')
        yield* promptVertexGeminiStream(
          messages as OpenAIMessage[],
          system,
          vertexGeminiOptions
        )
        return // Exit successfully if Vertex AI stream works
      } catch (vertexError) {
        logger.error(
          { error: vertexError },
          'Error calling Gemini 2.5 Pro via Vertex AI Gemini Stream, falling back to User Key if available'
        )
        // 4. Try User's Gemini Key if available
        if (userId) {
          try {
            const userApiKey = await retrieveAndDecryptApiKey(userId, 'gemini')
            if (userApiKey) {
              logger.debug(
                'Attempting Gemini 2.5 Pro via Gemini API Stream (User Key)'
              )
              const userKeyStream = promptGeminiStream(
                system
                  ? messagesWithSystem(messages, system)
                  : (messages as OpenAIMessage[]),
                { ...geminiOptions, apiKey: userApiKey } // Pass user's key
              )
              yield* userKeyStream
              return // Exit successfully if user key stream works
            } else {
              logger.warn(
                { userId },
                'User Gemini key not found, cannot use as fallback.'
              )
              throw vertexError // Re-throw Vertex error if no user key
            }
          } catch (userKeyError) {
            logger.error(
              { error: userKeyError },
              'Error calling Gemini 2.5 Pro via Gemini API Stream (User Key). All fallbacks failed.'
            )
            // Re-throw the last error (Vertex error) if user key attempt also fails
            throw vertexError
          }
        } else {
          logger.warn('No userId provided, cannot attempt user key fallback.')
          // Re-throw the last error (Vertex error) if no user ID
          throw vertexError
        }
      }
    }
  }
}
