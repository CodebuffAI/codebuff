import { VertexAI } from '@google-cloud/vertexai'
import { GeminiModel } from 'common/constants'
import { OpenAIMessage } from './openai-api'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { countTokens, countTokensJson } from './util/token-counter'
import { generateCompactId } from 'common/util/string'
import { Content, Part } from '@google-cloud/vertexai/build/src/types/content'

let vertexAI: VertexAI | null = null

const getVertexAI = () => {
  if (!vertexAI) {
    vertexAI = new VertexAI({
      project: env.GOOGLE_CLOUD_PROJECT_ID,
      location: 'us-central1',
    })
  }
  return vertexAI
}

export type GeminiMessage = OpenAIMessage

/**
 * Transform messages between our internal format and Vertex AI's format.
 * Converts OpenAI message format to Vertex AI Content/Part structure.
 */
function transformMessages(messages: OpenAIMessage[]): Content[] {
  return messages.map(message => {
    const role = message.role === 'assistant' ? 'model' : message.role

    // For system messages, we need to handle them specially
    if (role === 'system') {
      return {
        role,
        parts: [{ text: String(message.content) }] as Part[]
      }
    }

    if (typeof message.content === 'object' && message.content !== null) {
      if (Array.isArray(message.content)) {
        // Handle array content
        const parts: Part[] = message.content.map(part => {
          if (typeof part === 'object' && part !== null && 'type' in part && part.type === 'image_url') {
            const base64Data = part.image_url.url.split(',')[1] || ''
            return {
              inlineData: {
                data: base64Data,
                mimeType: 'image/jpeg'
              }
            } as Part
          }
          return { text: String(part) } as Part
        })
        return { role, parts }
      }
    }

    // Default to text content
    return {
      role,
      parts: [{ text: String(message.content) }] as Part[]
    }
  })
}

export async function promptGemini(
  messages: GeminiMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: GeminiModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
) {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    model,
    userId,
    temperature,
  } = options

  const startTime = Date.now()

  try {
    const vertex = getVertexAI()
    const systemMessage = messages.find(m => m.role === 'system')
    const nonSystemMessages = messages.filter(m => m.role !== 'system')

    // Transform messages to Vertex AI's format
    const transformedMessages = transformMessages(nonSystemMessages)
    // Find system message if it exists

    const transformedMessages = transformMessages(nonSystemMessages)

    const generativeModel = vertex.getGenerativeModel({
      model,
      generationConfig: {
        temperature: temperature,
      }
    })

    const chat = generativeModel.startChat({
      history: transformedMessages.slice(0, -1),
    })

    // If there's a system message, send it first
    if (systemMessage) {
      await chat.sendMessage([{ text: String(systemMessage.content) }] as Part[])
    }

    const lastMessage = transformedMessages[transformedMessages.length - 1]
    const response = await chat.sendMessage(lastMessage.parts)

    const content = response.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Estimate token counts since Vertex AI doesn't provide them directly
    const inputTokens = countTokensJson(transformedMessages)
    const outputTokens = countTokens(content)

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
    })

    return content
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
        messages,
      },
      'Error calling Vertex AI API'
    )

    throw error
  }
}
