import OpenAI from 'openai'
import { RATE_LIMIT_POLICY } from './constants'
import { STOP_MARKER } from 'common/constants'
import { Stream } from 'openai/streaming'

export type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam

let openai: OpenAI | null = null

const getOpenAI = (userId: string) => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPEN_AI_KEY,
      baseURL: 'https://oai.helicone.ai/v1',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
        'Helicone-User-Id': userId,
        'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
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

export async function promptOpenAI(
  userId: string,
  messages: OpenAIMessage[],
  model: string,
  options: { temperature?: number } = {}
) {
  const openai = getOpenAI(userId)
  try {
    const response = await Promise.race([
      openai.chat.completions.create({
        model,
        messages,
        temperature: options.temperature || 0,
      }),
      timeoutPromise(200000) as Promise<OpenAI.Chat.ChatCompletion>,
    ])

    if (
      response.choices &&
      response.choices.length > 0 &&
      response.choices[0].message
    ) {
      return response.choices[0].message.content || ''
    } else {
      throw new Error('No response from OpenAI')
    }
  } catch (error) {
    console.error(
      'Error calling OpenAI API:',
      error && typeof error === 'object' && 'message' in error
        ? error.message
        : 'Unknown error'
    )
    throw error
  }
}

export async function promptOpenAIWithContinuation(
  messages: OpenAIMessage[],
  options: { model: string; userId: string }
) {
  const { model, userId } = options
  let fullResponse = ''
  let continuedMessage: OpenAIMessage | null = null
  let isComplete = false

  // Add the instruction to end with the stop marker to the last user message
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

  const openai = getOpenAI(userId)

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessage
      ? [...messages, continuedMessage]
      : messages

    try {
      const stream = await Promise.race([
        openai.chat.completions.create({
          model,
          messages: messagesWithContinuedMessage,
          stream: true,
          temperature: 0,
        }),
        timeoutPromise(120000) as Promise<
          Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
        >,
      ])

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          fullResponse += chunk.choices[0].delta.content
        }
      }

      if (continuedMessage) {
        console.log('got continuation response')
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
      console.error(
        'Error calling OpenAI API:',
        error && typeof error === 'object' && 'message' in error
          ? error.message
          : 'Unknown error'
      )
      throw error
    }
  }

  return fullResponse
}
