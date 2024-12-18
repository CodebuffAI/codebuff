import OpenAI from 'openai'
import { STOP_MARKER, TEST_USER_ID, models } from 'common/constants'
import { createMarkdownFileBlock } from 'common/util/file'
import { Stream } from 'openai/streaming'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'

export type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam

let openai: OpenAI | null = null

const getOpenAI = (fingerprintId: string) => {
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

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('OpenAI API request timed out')), ms)
  )

export async function planComplexChange(
  prompt: string,
  files: Record<string, string>,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const messages: OpenAIMessage[] = [
    {
      role: 'user',
      content: `${
        Object.keys(files).length > 0
          ? `Relevant Files:\n\n${Object.entries(files)
              .map(([path, content]) => createMarkdownFileBlock(path, content))
              .join('\n')}\n\n`
          : ''
      }${prompt}

Please plan and create a detailed solution.`,
    },
  ]

  console.log('messages', messages)
  const response = await promptOpenAI(messages, {
    ...options,
    model: models.o1,
    temperature: 1,
  })

  return response
}

export async function promptOpenAI(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: string
    userId: string | undefined
    predictedContent?: string
    temperature?: number
  }
) {
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
    const response = await Promise.race([
      openai.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0,
        // store: true,
        ...(predictedContent
          ? { prediction: { type: 'content', content: predictedContent } }
          : {}),
      }),
      timeoutPromise(
        model.startsWith('o1') ? 800_000 : 200_000
      ) as Promise<OpenAI.Chat.ChatCompletion>,
    ])

    if (
      response.choices &&
      response.choices.length > 0 &&
      response.choices[0].message
    ) {
      const messageId = response.id
      const content = response.choices[0].message.content || ''
      if (messages.length > 0 && userId !== TEST_USER_ID) {
        saveMessage({
          messageId,
          userId,
          clientSessionId,
          fingerprintId,
          userInputId,
          model,
          request: messages,
          response: content,
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          finishedAt: new Date(),
          latencyMs: Date.now() - startTime,
        })
      }
      return content
    } else {
      throw new Error('No response from OpenAI')
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
          console.log('chunk.usage', chunk.usage)
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
