import OpenAI from 'openai'
import { z } from 'zod'
import { openaiModels, STOP_MARKER, TEST_USER_ID } from 'common/constants'
import { Stream } from 'openai/streaming'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { ChatCompletionReasoningEffort } from 'openai/resources/chat/completions'

export type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam
import { OpenAIModel } from 'common/constants'
import { match, P } from 'ts-pattern'

let openai: OpenAI | null = null

export const getOpenAI = (fingerprintId: string) => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: env.OPEN_AI_KEY,
      baseURL: 'https://oai.helicone.ai/v1',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
        'Helicone-User-Id': fingerprintId,
        // 'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
        // 'Helicone-LLM-Security-Enabled': 'true',
      },
    })
  }

  return openai
}

function transformedMessage(message: any, model: OpenAIModel): OpenAIMessage {
  return match(model)
    .with(
      openaiModels.gpt4o,
      openaiModels.gpt4omini,
      openaiModels.generatePatch,
      () =>
        match(message)
          .with(
            {
              content: {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: P.string,
                },
              },
            },
            (m) => ({
              // Convert to OpenAI's image_url format while preserving the base64 data
              ...message,
              content: {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${m.content.source.data}`,
                },
              },
            })
          )
          .otherwise(() => message)
    )
    .with(openaiModels.o3mini, () => {
      const hasImages = [message.content ?? []].some(
        (obj: { type: string }) => obj.type === 'image'
      )
      if (hasImages) {
        logger.info(
          'Stripping images from message - o3mini does not support images'
        )
        return {
          ...message,
          content: message.content.filter(
            (obj: { type: string }) => obj.type !== 'image'
          ),
        }
      }
      return message
    })
    .exhaustive()
}

export async function* promptOpenAIStream(
  messages: OpenAIMessage[],
  options: OpenAIOptions
): AsyncGenerator<string, void, unknown> {
  const transformedMessages = messages.map((msg) =>
    transformedMessage(msg, options.model)
  )
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    model,
    userId,
    predictedContent,
  } = options
  const openai = getOpenAI(fingerprintId)
  const startTime = Date.now()

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: transformedMessages,
      temperature: options.temperature ?? 0,
      stream: true,
      ...(predictedContent
        ? { prediction: { type: 'content', content: predictedContent } }
        : {}),
    })

    let content = ''
    let messageId: string | undefined
    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        const delta = chunk.choices[0].delta.content
        content += delta
        yield delta
      }

      if (chunk.usage) {
        messageId = chunk.id
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    if (messageId && messages.length > 0 && userId !== TEST_USER_ID) {
      saveMessage({
        messageId,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
      })
    }
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling OpenAI API'
    )
    throw error
  }
}

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('OpenAI API request timed out')), ms)
  )

export interface OpenAIOptions {
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: OpenAIModel
  userId: string | undefined
  predictedContent?: string
  temperature?: number
  reasoningEffort?: ChatCompletionReasoningEffort
}

export async function promptOpenAI(
  messages: OpenAIMessage[],
  options: OpenAIOptions
) {
  try {
    // Handle o-series reasoning models differently
    if (options.model.startsWith('o')) {
      const openai = getOpenAI(options.fingerprintId)
      const startTime = Date.now()

      try {
        const response = await Promise.race([
          openai.chat.completions.create({
            model: options.model,
            messages,
            ...(options.predictedContent
              ? {
                  prediction: {
                    type: 'content',
                    content: options.predictedContent,
                  },
                }
              : {}),
            stream: false,
            reasoning_effort: options.reasoningEffort || 'medium',
          }),
          timeoutPromise(1_000_000),
        ])

        // Validate OpenAI response shape with Zod
        const ChatCompletionSchema = z.object({
          id: z.string(),
          choices: z
            .array(
              z.object({
                message: z.object({
                  content: z.string(),
                }),
              })
            )
            .min(1),
          usage: z.object({
            prompt_tokens: z.number(),
            completion_tokens: z.number(),
            prompt_tokens_details: z.object({
              cached_tokens: z.number(),
            }),
          }),
        })

        const result = ChatCompletionSchema.safeParse(response)
        if (!result.success) {
          throw new Error(
            'Invalid response from OpenAI: ' + result.error.message
          )
        }

        const content = result.data.choices[0].message.content

        // Save message metrics
        if (messages.length > 0 && options.userId !== TEST_USER_ID) {
          const totalInputTokens = result.data.usage.prompt_tokens
          const cacheReadInputTokens =
            result.data.usage.prompt_tokens_details.cached_tokens
          const inputTokens = totalInputTokens - cacheReadInputTokens
          const outputTokens = result.data.usage.completion_tokens

          saveMessage({
            messageId: result.data.id,
            userId: options.userId,
            clientSessionId: options.clientSessionId,
            fingerprintId: options.fingerprintId,
            userInputId: options.userInputId,
            model: options.model,
            request: messages,
            response: content,
            inputTokens,
            cacheReadInputTokens,
            outputTokens,
            finishedAt: new Date(),
            latencyMs: Date.now() - startTime,
          })
        }

        return content
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'OpenAI API request timed out'
        ) {
          throw new Error(
            'Request timed out - the model is taking too long to respond'
          )
        }
        throw error
      }
    } else {
      // Use streaming for other models
      const stream = promptOpenAIStream(messages, options)
      let content = ''
      await Promise.race([
        (async () => {
          for await (const chunk of stream) {
            content += chunk
          }
        })(),
        timeoutPromise(200_000),
      ])
      const result = content

      if (!result) {
        throw new Error('No response from OpenAI')
      }
      return result
    }
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling OpenAI API'
    )
    throw error
  }
}

export async function promptOpenAIWithContinuation(
  messages: OpenAIMessage[],
  options: {
    model: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
  }
) {
  const { model, clientSessionId, fingerprintId, userInputId, userId } = options
  let fullResponse = ''
  let continuedMessage: OpenAIMessage | null = null
  let isComplete = false

  const lastUserMessageIndex = messages.findLastIndex(
    (msg) => msg.role === 'user'
  )
  if (lastUserMessageIndex !== -1) {
    messages[lastUserMessageIndex].content +=
      `\n\nAlways end your response with "${STOP_MARKER}".`
  } else {
    messages.push({
      role: 'user',
      content: `Always end your response with "${STOP_MARKER}".`,
    })
  }

  const openai = getOpenAI(fingerprintId)

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessage
      ? [...messages, continuedMessage]
      : messages

    const startTime = Date.now()
    try {
      const stream = await Promise.race([
        openai.chat.completions.create({
          model,
          messages: messagesWithContinuedMessage,
          stream: true,
          temperature: 0,
          stream_options: {
            include_usage: true,
          },
        }),
        timeoutPromise(120000) as Promise<
          Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
        >,
      ])

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          fullResponse += chunk.choices[0].delta.content
        }

        if (chunk.usage) {
          const messageId = chunk.id
          saveMessage({
            messageId,
            userId,
            clientSessionId,
            fingerprintId,
            userInputId,
            model,
            request: messages,
            response: fullResponse,
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            finishedAt: new Date(),
            latencyMs: Date.now() - startTime,
          })
        }
      }

      if (continuedMessage) {
        logger.debug('Got continuation response')
      }

      if (fullResponse.includes(STOP_MARKER)) {
        isComplete = true
        fullResponse = fullResponse.replace(STOP_MARKER, '')
      } else {
        continuedMessage = {
          role: 'assistant',
          content: fullResponse,
        }
        messages.push({
          role: 'user',
          content: `You got cut off, but please continue from the very next line of your response. Do not repeat anything you have just said. Just continue as if there were no interruption from the very last character of your last response. (Alternatively, just end your response with the following marker if you were done generating and want to allow the user to give further guidance: ${STOP_MARKER})`,
        })
      }
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error calling OpenAI API'
      )

      throw error
    }
  }

  return fullResponse
}
