import { models } from 'common/constants'
import {
  createMarkdownFileBlock,
  parseMarkdownCodeBlock,
} from 'common/util/file'

import { CoreMessage } from 'ai'
import { toolSchema } from 'common/constants/tools'
import { env } from '../env.mjs'
import { saveMessage } from '../llm-apis/message-cost-tracker'
import { logger } from '../util/logger'
import { countTokens } from '../util/token-counter'
import { promptAiSdk } from './vercel-ai-sdk/ai-sdk'

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Relace API request timed out')), ms)
  )

export async function promptRelaceAI(
  initialCode: string,
  editSnippet: string,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    messageId: string
    userMessage?: string
  }
) {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    messageId,
  } = options
  const startTime = Date.now()

  try {
    const response = (await Promise.race([
      fetch('https://codebuff-instantapply.endpoint.relace.run/v1/code/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RELACE_API_KEY}`,
        },
        body: JSON.stringify({
          initialCode,
          editSnippet,
          stream: false,
          'relace-metadata': {
            'codebuff-id': messageId,
            'codebuff-user-prompt': userMessage,
          },
        }),
      }),
      timeoutPromise(100_000),
    ])) as Response

    if (!response.ok) {
      throw new Error(
        `Relace API error: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as { mergedCode: string }
    const content = data.mergedCode

    const fakeRequestContent = `Initial code:${createMarkdownFileBlock('', initialCode)}\n\nEdit snippet${createMarkdownFileBlock('', editSnippet)}`
    saveMessage({
      messageId,
      userId,
      clientSessionId,
      fingerprintId,
      userInputId,
      model: 'relace-fast-apply',
      request: [
        {
          role: 'user',
          content: fakeRequestContent,
        },
      ],
      response: content,
      inputTokens: countTokens(initialCode + editSnippet),
      outputTokens: countTokens(content),
      finishedAt: new Date(),
      latencyMs: Date.now() - startTime,
    })
    return content + '\n'
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace AI, falling back to o3-mini'
    )

    // Fall back to Gemini
    const prompt = `You are an expert programmer. Please rewrite this code file to implement the edit snippet while preserving as much of the original code and behavior as possible.

Initial code:
\`\`\`
${initialCode}
\`\`\`

Edit snippet (the new content to implement):
\`\`\`
${editSnippet}
\`\`\`

Important:
1. Keep the changes minimal and focused
2. Preserve the original formatting, indentation, and comments
3. Only implement the changes shown in the edit snippet
4. Return only the code, no explanation needed

Please output just the complete updated file content with no other text.`

    const content = await promptAiSdk(
      [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '```\n' },
      ],
      {
        clientSessionId,
        fingerprintId,
        userInputId,
        model: models.o3mini,
        userId,
      }
    )

    return parseMarkdownCodeBlock(content) + '\n'
  }
}

export interface RankedFile<T> {
  file: T
  score: number
}

export type FileWithPath = {
  path: string
  content: string
}

export async function rerank(
  files: FileWithPath[],
  prompt: string,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    messageId: string
  }
) {
  const { clientSessionId, fingerprintId, userInputId, userId, messageId } =
    options
  const startTime = Date.now()

  if (!prompt || !files.length) {
    logger.warn('Empty prompt or files array passed to rerank')
    return files.map((f) => f.path)
  }

  // Convert files to Relace format
  const relaceFiles = files.map((f) => ({
    filename: f.path,
    code: f.content,
  }))

  try {
    const response = (await Promise.race([
      fetch('https://ranker.endpoint.relace.run/v1/code/rank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RELACE_API_KEY}`,
        },
        body: JSON.stringify({
          query: prompt,
          codebase: relaceFiles,
          token_limit: 128000,
          'relace-metadata': {
            'codebuff-id': messageId,
            'codebuff-user-prompt': prompt,
          },
        }),
      }),
      timeoutPromise(100_000),
    ])) as Response

    if (!response.ok) {
      throw new Error(
        `Relace API error: ${response.status} ${response.statusText}`
      )
    }

    const rankings: string[] = await response.json()
    if (!rankings || !Array.isArray(rankings)) {
      throw new Error('Invalid response format from Relace API')
    }

    const fakeRequestContent = `Query: ${prompt}\n\nFiles:\n${files.map((f) => `${f.path}:\n${f.content}`).join('\n\n')}`
    saveMessage({
      messageId,
      userId,
      clientSessionId,
      fingerprintId,
      userInputId,
      model: 'relace-ranker',
      request: [
        {
          role: 'user',
          content: fakeRequestContent,
        },
      ],
      response: JSON.stringify(rankings),
      inputTokens: countTokens(fakeRequestContent),
      outputTokens: countTokens(JSON.stringify(rankings)),
      finishedAt: new Date(),
      latencyMs: Date.now() - startTime,
    })

    return rankings
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace ranker API'
    )
    // Return original files order on error instead of throwing
    return files.map((f) => f.path)
  }
}

const toolParams = Object.entries(toolSchema)
  .map(([name, params]) => {
    return `\`${name}\`: [${params
      .map((p) => (typeof p === 'string' ? JSON.stringify(p) : `${p}`))
      .join(', ')}]`
  })
  .join('\n')

const outputSchema = {
  type: 'object',
  properties: {
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          args: { type: 'object' },
        },
        required: ['name', 'args'],
      },
    },
  },
}

const systemInstructions = `
You are a helpful assistant that structures potentially malformed XML text into tool calls.

Below are the available tools and their parameters. Parameters are either "String" or /RegExp/ values.
${toolParams}

Output according to this schema:
${JSON.stringify(outputSchema, null, 2)}
`.trim()

export async function toolFormatter(
  assistantMessage: string,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    messageId: string
  }
) {
  const { clientSessionId, fingerprintId, userInputId, userId, messageId } =
    options
  const startTime = Date.now()

  const messages: CoreMessage[] = [
    { role: 'system', content: systemInstructions },
    { role: 'user', content: assistantMessage },
  ]

  try {
    const response = (await Promise.race([
      fetch('https://tool-formatter.endpoint.relace.run/v1/code/format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RELACE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'Tool-Formatter',
          messages,
          temperature: 0,
          max_tokens: 32_000,
          response_format: { type: 'json_schema', json_schema: outputSchema },
          'relace-metadata': {
            'codebuff-id': messageId,
          },
        }),
      }),
      timeoutPromise(100_000),
    ])) as Response

    if (!response.ok) {
      const errorText = await response
        .text()
        .catch(() => 'No error text available')
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText,
          assistantMessageLength: assistantMessage.length,
        },
        'Relace Tool Formatter API error'
      )
      return
    }

    const toolCalls = (await response.json()).choices[0].message.content
      .tool_calls

    saveMessage({
      messageId,
      userId,
      clientSessionId,
      fingerprintId,
      userInputId,
      model: 'relace-tool-formatter',
      request: messages,
      response: toolCalls,
      inputTokens: countTokens(systemInstructions + assistantMessage),
      outputTokens: countTokens(JSON.stringify(toolCalls)),
      finishedAt: new Date(),
      latencyMs: Date.now() - startTime,
      chargeUser: false,
    })

    logger.info({ toolCalls }, 'Relace Tool Formatter')
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace Tool Formatter API'
    )
    // Silent failure as specified - no fallback needed
    return
  }
}
