import { CostMode, GeminiModel, openaiModels } from 'common/constants'
import { Message } from 'common/types/message'
import { promptGemini } from './gemini-api'
import { promptGemini as promptVertexGemini } from './gemini-vertex-api'
import { promptClaude, System } from './claude'
import { logger } from '../util/logger'
import { claudeModels, geminiModels } from 'common/constants'
import { messagesWithSystem } from '../util/messages'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { promptOpenRouterStream } from './open-router'
import { promptGeminiStream } from './gemini-api'

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
): AsyncGenerator<string, void, unknown> {
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
      // 2. Try Gemini API Stream
      logger.debug('Attempting Gemini 2.5 Pro via Gemini API Stream')
      const stream = promptGeminiStream(
        system
          ? messagesWithSystem(messages, system)
          : (messages as OpenAIMessage[]),
        geminiOptions
      )

      // Since promptGeminiStream now correctly returns ReadableStream<string>,
      // we can directly yield from it.
      yield* stream

      return // Exit successfully if Gemini API stream works
    } catch (finalError) {
      logger.error(
        { error: finalError },
        'Error calling Gemini 2.5 Pro via Gemini API Stream. All fallbacks failed.'
      )
      throw finalError // Re-throw the last error if all attempts fail
    }
  }
}
