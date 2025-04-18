import {
  Content,
  GenerateContentResult,
  GenerateContentStreamResult,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  Part,
} from '@google/generative-ai'
import { GeminiModel, geminiModels, TEST_USER_ID } from 'common/constants'
import { removeUndefinedProps } from 'common/util/object'
import { generateCompactId } from 'common/util/string'
import OpenAI from 'openai'

import { env } from '../env.mjs'
import { OpenAIMessage } from '../llm-apis/openai-api'
import { logger } from '../util/logger'
import { saveMessage } from './message-cost-tracker'

type OpenAIMessageContentPart = OpenAI.Chat.ChatCompletionContentPart

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
]

function transformMessagesToGoogle(messages: OpenAIMessage[]): Content[] {
  return messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => {
      const role = msg.role === 'assistant' ? 'model' : 'user'
      let parts: Part[] = []

      if (typeof msg.content === 'string') {
        parts = [{ text: msg.content }]
      } else if (Array.isArray(msg.content)) {
        const contentParts = msg.content as OpenAIMessageContentPart[]
        parts = contentParts.map((part) => {
          if (part.type === 'text') {
            return { text: part.text }
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const url = part.image_url.url
            const base64Data = url.split(',')[1] || ''
            const mimeTypeMatch = url.match(/^data:(image\/\w+);base64,/)
            const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg'
            return {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            }
          }
          logger.warn(
            { part },
            'Unknown message part type encountered during transformation'
          )
          return { text: '[Unsupported Content]' }
        })
      } else {
        logger.warn(
          { content: msg.content },
          'Unexpected message content format encountered during transformation'
        )
        parts = [{ text: '[Unsupported Content]' }]
      }

      return { role, parts }
    })
}

const genAIClients: Record<string, GoogleGenerativeAI> = {}

const getGenerativeModel = (modelName: GeminiModel, apiKey?: string) => {
  const effectiveApiKey = apiKey ?? env.GEMINI_API_KEY
  if (!effectiveApiKey) {
    throw new Error('Missing Gemini API Key')
  }

  if (!genAIClients[effectiveApiKey]) {
    genAIClients[effectiveApiKey] = new GoogleGenerativeAI(effectiveApiKey)
  }
  const genAI = genAIClients[effectiveApiKey]

  return genAI.getGenerativeModel({
    model: modelName,
    safetySettings,
  })
}

const timeoutPromise = (ms: number, message: string) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  )

export function promptGeminiStream(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: GeminiModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
    apiKey?: string
    stopSequences?: string[]
  }
): ReadableStream<string> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    temperature,
    userId,
    model,
    maxTokens,
    apiKey,
    stopSequences,
  } = options

  const streamController = new AbortController()
  const outputStream = new ReadableStream<string>({
    async start(controller) {
      const startTime = Date.now()
      let streamResult: GenerateContentStreamResult | null = null
      try {
        const generativeModel = getGenerativeModel(model, apiKey)
        const transformedMessages = transformMessagesToGoogle(messages)

        const generationConfig = removeUndefinedProps({
          temperature: temperature ?? 0.7,
          maxOutputTokens: maxTokens,
          stopSequences,
        })

        streamResult = await generativeModel.generateContentStream({
          contents: transformedMessages,
          generationConfig,
        })

        let content = ''
        for await (const chunk of streamResult.stream) {
          if (streamController.signal.aborted) {
            logger.warn('Gemini stream aborted, stopping processing.')
            break
          }
          const textChunk = chunk.text()
          if (textChunk) {
            content += textChunk
            controller.enqueue(textChunk)
          }
        }

        const response = streamResult ? await streamResult.response : null
        const usageMetadata = response?.usageMetadata
        const inputTokens = usageMetadata?.promptTokenCount ?? 0
        const outputTokens = usageMetadata?.candidatesTokenCount ?? 0

        if (messages.length > 0 && userId !== TEST_USER_ID) {
          saveMessage({
            messageId: generateCompactId(),
            userId,
            clientSessionId,
            fingerprintId,
            userInputId,
            model,
            request: messages,
            response: content,
            inputTokens,
            outputTokens,
            finishedAt: new Date(),
            latencyMs: Date.now() - startTime,
            usesUserApiKey: !!apiKey,
          })
        }

        controller.close()
      } catch (error) {
        logger.error(
          {
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
            messages,
            usingUserKey: !!apiKey,
            model,
          },
          'Error calling Gemini API Stream'
        )
        controller.error(error)
      }
    },
    cancel(reason) {
      logger.warn({ reason }, 'Gemini stream cancelled')
      streamController.abort()
    },
  })

  return outputStream
}

export async function promptGemini(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: GeminiModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
    apiKey?: string
    stopSequences?: string[]
  }
): Promise<string> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    temperature,
    userId,
    model,
    maxTokens,
    apiKey,
    stopSequences,
  } = options

  const startTime = Date.now()
  let result: GenerateContentResult | null = null

  try {
    const generativeModel = getGenerativeModel(model, apiKey)
    const transformedMessages = transformMessagesToGoogle(messages)

    const generationConfig = removeUndefinedProps({
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens,
      stopSequences,
    })

    const timeoutMs = model === geminiModels.gemini2flash ? 60_000 : 200_000
    result = await Promise.race([
      generativeModel.generateContent({
        contents: transformedMessages,
        generationConfig,
      }),
      timeoutPromise(
        timeoutMs,
        `Gemini API request timed out after ${timeoutMs}ms`
      ),
    ])

    if (!result) {
      throw new Error(
        'Gemini API call resulted in null or timed out before returning a result.'
      )
    }
    const response = result.response

    const content = response.text()
    const usageMetadata = response.usageMetadata
    const inputTokens = usageMetadata?.promptTokenCount ?? 0
    const outputTokens = usageMetadata?.candidatesTokenCount ?? 0

    if (messages.length > 0 && userId !== TEST_USER_ID) {
      saveMessage({
        messageId: generateCompactId(),
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens,
        outputTokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
        usesUserApiKey: !!apiKey,
      })
    }

    return content
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
        messages,
        usingUserKey: !!apiKey,
        model,
      },
      'Error calling Gemini API'
    )
    throw error
  }
}
