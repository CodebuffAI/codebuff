import { VertexAI } from '@google-cloud/vertexai'
import { GeminiModel } from 'common/constants'
import { OpenAIMessage } from './openai-api'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { countTokens, countTokensJson } from './util/token-counter'
import { generateCompactId } from 'common/util/string'
import {
  Content,
  Part,
  RequestOptions,
} from '@google-cloud/vertexai/build/src/types/content'
import { System } from './claude'

let vertexAI: VertexAI | null = null
let customHeaders: Headers | null = null

const getVertexAI = () => {
  if (!vertexAI) {
    vertexAI = new VertexAI({
      project: env.GOOGLE_CLOUD_PROJECT_ID,
      location: 'us-central1',
      apiEndpoint: 'gateway.helicone.ai',
    })
    customHeaders = new Headers({
      'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
      'Helicone-Target-URL': `https://us-central1-aiplatform.googleapis.com`,
    })
  }
  return vertexAI
}
export type GeminiMessage = OpenAIMessage

function transformToPart(part: any): Part {
  if (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'image_url'
  ) {
    // handle image URL: extract base64 data if needed
    const base64Data = (part as any).image_url.url.split(',')[1] || ''
    return {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg',
      },
    } as Part
  } else if (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text'
  ) {
    return { text: part.text } as Part
  }

  return { text: String(part) } as Part
}
/**
 * Transform messages between our internal format and Vertex AI's format.
 * Converts OpenAI message format to Vertex AI Content/Part structure.
 */
function transformMessages(messages: OpenAIMessage[]): Content[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      throw new Error('Yoo, only top level system supported in Gemini Vertex')
    }
    const role = message.role === 'assistant' ? 'model' : message.role
    if (typeof message.content === 'object' && message.content !== null) {
      if (Array.isArray(message.content)) {
        const parts: Part[] = message.content.map((part) =>
          transformToPart(part)
        )
        return { role, parts }
      }
    }
    return {
      role,
      parts: [{ text: String(message.content) }] as Part[],
    }
  })
}

function transformSystem(system: System | undefined): Content | undefined {
  if (!system) {
    return undefined
  }
  if (typeof system === 'string') {
    return { role: 'system', parts: [{ text: system }] }
  }
  return { role: 'system', parts: system.map(transformToPart) }
}

export async function promptGemini(
  messages: GeminiMessage[],
  system: System | undefined,
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
    const requestOptions: RequestOptions = {
      customHeaders,
    } as RequestOptions

    const generativeModel = vertex.getGenerativeModel(
      {
        model,
        generationConfig: {
          temperature: temperature,
        },
      },
      requestOptions
    )

    const transformedMessages = transformMessages(messages)

    const response = await generativeModel.generateContent({
      contents: transformedMessages,
      systemInstruction: transformSystem(system),
    })

    const content =
      response.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

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
